---
title: PyTorch 参数解剖：从 Tensor 内存布局到 258MB checkpoint 的精确账本
date: 2026-09-06 12:00:00
tags: [PyTorch, 显存, 训练调优, 科普]
categories: [深度学习实践]
description: 从 Tensor 的内存布局到 258MB checkpoint 的精确账本，解释显存构成与权重迁移限制。
---

> **系列 · Matcha-TTS 训练手记** ｜ [目录](/series/) ｜ 上一篇：[训练时硬件实况解读](/2026/09/06/what-cpu-gpu-memory-do-during-training/) ｜ 下一篇：[声码器注册表与评估体系](/2026/09/06/matcha-tts-vocoder-registry-metrics-and-demo/)

训练时显存里到底住了什么？checkpoint 为什么恰好是某个大小？换骨干为什么不能热迁移权重？这篇用本项目的真实数字（MatchaTTS + ConvNeXt V2 变体，全模型 22.5M 参数 = encoder 7.2M + decoder 15.3M）把这些问题一次讲清。所有数字来自 `torchinfo` 参数表和 checkpoint 逐键字节统计。

## 1. 最底层：一个 Tensor 是什么

每个张量由两部分组成：

- **元数据**（轻量，几百字节）：shape、stride、dtype、device、`requires_grad`
- **Storage**（真正连续的字节缓冲，可被多个张量共享）

```text
x : Tensor (元数据 ~几百 B, shape=[256,172], f32, cuda:0)
  storage ──→ 一整块连续内存: 256 × 172 × 4B ≈ 176 KB
```

`x.view()`、`x[:, 10]` 这类操作**不复制数据**，只新建一个指向同一 Storage 的视图（零拷贝）——这就是 forward 里"按引用传递"的物理基础。而 `.to(device)` / `.clone()` 会新建 Storage。

`nn.Parameter` 只是"`requires_grad=True` 的 Tensor"再挂进模块登记簿，除此之外与普通张量无异。

<figure>
  <img src="/img/param-tensor-storage.svg" alt="张量 = 元数据 + Storage">
  <figcaption>张量 = 元数据 + Storage：视图共享 Storage（零拷贝），.to(device)/clone() 才产生新缓冲</figcaption>
</figure>

## 2. 模块树：参数如何被"登记"和"编址"

每个 `nn.Module` 内部有三个字典：`_parameters`（可训练）、`_buffers`（不训练但要存档，如 mel 均值/方差）、`_modules`（子模块）。构造函数里 `self.xxx = nn.Parameter/Module` 就是注册动作。

整个模型是一棵树；`state_dict()` 就是**深度优先摊平**这棵树，路径名 = 属性名用点号连接 = 加载时的"门牌号"：

```text
MatchaTTS
├── encoder (TextEncoder)
├── decoder (CFM)
│   └── estimator (Decoder)
│       └── down_blocks.0.0 (ConvNeXt 块)
│           ├── block1.dwconv.weight        [256,1,7]
│           ├── block1.norm.weight          [256]
│           └── grn.gamma / grn.beta        [1,1,1024]
└── mel_mean / mel_std  (buffer，标量，不训练)
```

两个关键认知：

1. **名字即地址，数值即家具**：加载 = 按门牌号 `copy_()` 逐个搬入。换骨干 → 门牌号对不上 → `missing/unexpected keys`
2. **图纸与家具分两条通道**：架构超参（如 `resnet_type`）**不在** `state_dict` 里，而在 checkpoint 的 `hyper_parameters` 中

> 去重规则：两个模块共享同一个 Parameter（权重共享）时，`state_dict` 按对象 id 去重只留一个条目。

<figure>
  <img src="/img/param-module-tree.svg" alt="模块树到 state_dict">
  <figcaption>模块树 → state_dict 摊平：名字即地址，数值即家具；结构超参走 hparams 独立通道</figcaption>
</figure>

## 3. Autograd：激活从哪来，梯度到哪去

前向时，每一步可微运算都会在**动态计算图**上登记一个节点，并把反向需要的中间结果（**激活**）挂在节点上——这就是显存里"激活"的来源，由计算图持有，`backward()` 走完即释放。

梯度沿图反向流，最后由 `AccumulateGrad` 节点写进叶子参数的 `.grad`。注意这里是**累加**（`+=`）而不是覆盖——梯度累积能成立就是因为这个。

```text
z(噪声), mu_y(条件), t ──→ estimator 前向图（每个算子=节点，节点间挂激活）
                             ↓
                     v_pred (B,80,T) ──→ MSE ──→ loss (标量)
                             ↓ backward()
                     各 Parameter 的 .grad += ...  → 图与激活释放
```

<figure>
  <img src="/img/param-autograd.svg" alt="计算图与梯度">
  <figcaption>前向建图挂激活（蓝），反向沿图写 .grad（红）；激活随图释放，.grad 常驻</figcaption>
</figure>

**为什么梯度累积数学等价**：`.grad += 微批梯度` 天然求和；两个均批梯度之和 = 大批平均梯度 ×2，缩放常数被学习率吸收。且本项目用 GroupNorm/LayerNorm（无跨样本统计），batch 切分零副作用。

## 4. 一个优化器步的完整数据流

当前配置：`batch 32 × 累积 2`、`precision: 16-mixed`、`gradient_clip_val: 5.0`。

```text
微批次 ① (32 样本)
  H2D 拷贝(pinned) → ★前向 autocast fp16 → ★反向(×scale)
  loss.backward()：.grad += 缩放后梯度（不清零、不 step）
  激活随图释放 → 只有 .grad 攒着（很小）

微批次 ② (同上再来一遍)
  .grad 现在持有"两个 32 样本微批之和" ≈ batch64 的梯度
  至此累计 64 样本信息，尚未更新任何参数

累积边界（第 2 个微批之后）——只有这里动参数
  scaler.unscale_(grads) → clip_grad_norm_(5.0) → optimizer.step() → zero_grad()
  Adam 用 .grad 更新 m/v 与参数（读写常驻 ~360MB 参数区）
```

带 ★ 的动作在显存上，其余在 CPU/RAM。**参数/梯度/Adam 状态始终常驻显存**，来回搬运的只有每个微批次的数据与激活。

<figure>
  <img src="/img/param-optimizer-step.svg" alt="一个优化器步">
  <figcaption>一个优化器步：微批次 ×2 攒梯度，只在累积边界动一次参数</figcaption>
</figure>

## 5. 显存地图：7.6GB 里都住了什么

```text
CUDA 上下文        ~0.4GB
参数 fp32 主本     ~90MB   (22.5M 全量)
梯度 .grad         ~90MB   (同形)
Adam m+v          ~180MB   (精确 2×)
激活              弹性，随 batch/序列长度 ← 大头
分配器缓存        已释放待复用
────────────────────────────
若越界 → 共享 GPU 内存(系统 RAM)，走 PCIe
        (16~32GB/s vs 显存 300+GB/s) → 利用率锯齿、it/s 掉数倍
```

batch 64 → 32 主要就动了"激活"这一项；常驻部分（蓝绿系）约 0.5GB 是固定的。

<figure>
  <img src="/img/param-vram-map.svg" alt="显存地图">
  <figcaption>显存地图：常驻（参数/梯度/Adam ~0.5GB）+ 弹性激活 + 分配器缓存；越界则落到共享显存</figcaption>
</figure>

## 6. checkpoint 258MB 的精确账本

对某个 `last.ckpt` 逐顶层键统计字节：

| 成分 | 实测 | 说明 |
|---|---|---|
| `state_dict`（模型 fp32） | 85.9 MiB | 22.5M 参数 × 4B = 90.1 MB；含 buffers |
| `optimizer_states`（Adam） | **171.8 MiB** | 每参数两条同形状态 m + v，fp32，**恰好是权重的 2 倍** |
| `hyper_parameters` | ≈0 | "图纸"（含 `resnet_type`、`act_fn`），pickle 序列化 |
| `epoch / global_step / lr_schedulers / loops` | ≈0 | 断点续训的全部进度状态 |
| **合计** | **257.7 MiB ≈ 文件 258.2MB** | 逐项对上，无未解释残余 |

**MiB vs MB 陷阱**：资源管理器显示的"MB"其实是 MiB（1 MiB = 1,048,576 B）。22.5M × 4B = 90.1 MB（十进制）= 85.9 MiB——两种进制都"对"，别用错进制对账。

## 7. 常见疑问映射回这套模型

| 疑问 | 解释 |
|---|---|
| 换 ConvNeXt 后为什么不能热迁移权重？ | 门牌号变了（`block1.block.0.weight` → `block1.dwconv.weight`）且形状不同；state_dict 严格按名匹配 |
| 为什么改结构要重训，换声码器不用？ | 声码器不进 state_dict 匹配范围（独立模型）；声学模型结构变了 = 门牌变了 = 必须重训 |
| `.to(device)` 后对象还是原来那个吗？ | 是。Parameter 对象身份不变，只换内部 Storage 指针，Python 侧引用继续有效 |
| 梯度累积为什么省显存？ | 激活随图即时释放，`.grad` 与参数同形（小）。"攒激活"贵，"攒梯度"便宜 |
| 16-mixed 省的是什么？ | 参数主本仍 fp32（常驻不变）；省的是**激活/中间值**（fp16）与 Tensor Core 计算。这也是它降显存到不了 50% 的原因 |
| 为什么 `weights_only=False`？ | ckpt 里 pickle 了 OmegaConf 对象，torch 2.6+ 默认安全模式拒绝 |
| 推理时为什么显存小得多？ | 无反向 → 无激活缓存、无 .grad、无 Adam 状态；常驻只剩参数 ~90MB |
| U-Net 和 ConvNeXt 版差多少参数？ | U-Net：encoder 7.2M + decoder 11.0M = 18.2M；ConvNeXt：decoder 15.3M，全模型 22.5M |

## 小结

- 显存大头是激活，参数、梯度、优化器状态属于常驻的小头（1M 参数大约 16MB 训练常驻）
- checkpoint 里三分之二是优化器状态（Adam 正好是权重的 2 倍），所以它比模型大得多很正常
- state_dict 的名字就是地址，"换结构要重训、换声码器不用"这类问题，看名字对不对得上就能解释
