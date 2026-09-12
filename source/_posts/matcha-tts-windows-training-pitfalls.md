---
title: Windows 从零训练 Matcha-TTS 的踩坑全集
date: 2026-09-05 12:00:00
tags: [Matcha-TTS, TTS, 环境配置, Windows]
categories: [Matcha-TTS]
description: 在 Windows 上从零训练 Matcha-TTS：安装、数据管线、训练稳定性与显存调优的全部踩坑记录。
---

> **系列 · Matcha-TTS 训练手记** ｜ [目录](/series/) ｜ 上一篇：[离线预处理缓存方案](/2026/09/04/offline-preprocessing-cache-for-tts-training/) ｜ 下一篇：[硬件原理入门](/2026/09/06/dl-hardware-primer/)

这是整个 Matcha-TTS 训练手记的第一篇：在一台 RTX 5060 Laptop（8GB 显存）+ 16GB 内存的 Windows 笔记本上，从克隆代码到第一次成功合成语音，踩过的坑和它们的解法。后来项目迁移到了 WSL2 并用上了 Mamba 骨干（另有专题），但这一篇里的坑大多是**平台无关**的，值得单独记录。

## 一、安装与环境

### 1. 装什么、怎么装

代码 clone 到本地即可，不需要 `pip install git+...`；只需要在仓库根目录 `pip install -e .`，作用是：装依赖 + 编译 Cython 对齐模块 + 注册命令行工具。国内网络建议换清华源，必要时配 `--no-build-isolation`。

### 2. 缺 MSVC 编译器，Cython 模块编译失败

```text
error: Microsoft Visual C++ 14.0 or greater is required
```

`matcha.utils.monotonic_align.core` 是 Cython 扩展，Windows 下没有编译器就装不上。官方解法是装几 GB 的 VS Build Tools，成本不划算。我的处理是"免编译安装"：

- `matcha/utils/monotonic_align/__init__.py`：尝试导入编译版，失败则回退到纯 Numpy 实现（逐行复刻 core.pyx 逻辑，200 组随机用例验证与 Cython 版逐位一致）
- `setup.py`：自定义 `TolerantBuildExt`，编译失败打印警告并跳过，安装不中断

代价是对齐计算稍慢（推理无感知）；日后装了编译器会自动切回 Cython 版。

### 3. espeak 未安装（phonemizer 的系统依赖）

实例化 datamodule 时 `RuntimeError`。`phonemizer` 依赖系统级原生程序 espeak-ng，pip 装不了：

```powershell
winget install --id eSpeak-NG.eSpeak-NG --silent
setx PHONEMIZER_ESPEAK_LIBRARY "C:\Program Files\eSpeak NG\libespeak-ng.dll"
setx PHONEMIZER_ESPEAK_PATH "C:\Program Files\eSpeak NG\espeak-ng.exe"
```

注意 phonemizer 3.4.0 **不会**自动发现 winget 的安装路径，环境变量必须手动设。

### 4. matplotlib 3.10 移除了 API

Sanity Check 后崩在 `'FigureCanvasTkAgg' object has no attribute 'tostring_rgb'`。matplotlib 3.10 删了 `tostring_rgb()`，且默认 TkAgg 后端会偷偷创建窗口。解法：`save_figure_to_numpy()` 改用 `buffer_rgba()`，并在模块顶部强制 `matplotlib.use("Agg")`。

## 二、数据与预处理

### 5. 缺训练/验证文件列表

配置指向的 `train.txt` / `val.txt` 不存在，只有原始 `metadata.csv`。写了 `scripts/prepare_ljspeech_filelists.py`：把 `id|原文|规范化文本` 转成训练格式 `wav相对路径|规范化文本`，固定种子 1234 划分 13000 训练 / 100 验证，并校验 wav 存在。

### 6. 离线预处理缓存（本轮最大优化）

训练时每轮都重复"wav→FFT→梅尔谱"和"espeak 音素化"，纯属浪费。改成离线算一次存盘：

- 新增 `scripts/preprocess_dataset.py`：多进程并行（8 进程 13100 条 47 秒）、断点续跑、`meta.json` 参数校验
- `TextMelDataset` 加缓存命中检测：命中直接读 `.npy` / `phonemes.json`，未命中自动回退现场计算；配置与缓存参数不一致时自动禁用缓存并告警

效果：缓存 2.2GB，6 个抽查样本与现场计算逐位一致，每轮训练大约快 30 秒。（这篇的完整版本另有一篇专题。）

### 7. 常驻 worker 吃内存

train/val 两个 loader 各 4 个 persistent worker，每个进程约 780MB，合计 ~6.2GB，16GB 内存直接顶到警戒线。缓解：缓存生效时训练集 worker 最多 2 个、**验证集 0 个**（100 条直接主进程读缓存），省约 4.6GB。

## 三、训练稳定性

### 8. 训练 9 轮后没有任何 checkpoint

想断点续训，发现 checkpoints 目录根本没建。原因：配置 `every_n_epochs: 100`；且新版 Lightning 规定 **last.ckpt 只在"本轮存过编号 checkpoint"时才跟着写**。改成 `every_n_epochs: 1`、`save_top_k: 3`（每个 ckpt 含优化器状态约 209MB）。**教训：改完配置先确认第 1 轮能产出 last.ckpt 再长挂。**

### 9. 系统睡眠杀死训练

训练"暂停"（GPU 1%，进程全没了），事件日志显示笔记本进入睡眠，唤醒后 CUDA 上下文损坏。笔记本挂训练三铁律——**禁系统睡眠、插电源、控温度**：

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

### 10. torch 2.6 的 weights_only 拒载 checkpoint

断点续训报 `UnpicklingError ... omegaconf.dictconfig.DictConfig was not an allowed global`。torch 2.6 起 `torch.load` 默认 `weights_only=True`，而 checkpoint 里 pickle 了 OmegaConf 对象。解法：`matcha/utils/utils.py` 加 `_torch_load_compat`（`weights_only=None` → `False`，仅恢复旧默认，本地文件可信），放在公共模块，训练/推理两条路径都生效。

### 11. Hydra 解析 checkpoint 文件名里的等号

`ckpt_path=...\checkpoint_epoch=071.ckpt` 报 `mismatched input '='`——文件名里的 `=` 被当成键值对分隔符。解法：`"ckpt_path='完整路径'"`（双引号包单引号）或复制改名为无 `=` 的文件。这也是 `last.ckpt` 顺手的隐藏原因。

## 四、显存与性能调优

### 12. batch 与梯度累积

| batch | 结果 |
|---|---|
| 32 | 稳，显存富裕 |
| 48 | 每轮略快，显存 6GB+ |
| 64 | GPU 利用率最高（60%+），但显存 7.7/8GB 贴上限，有概率性 OOM |

缓解碎片：`PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`；摊薄每轮固定开销：`check_val_every_n_epoch=5`。

最终采用 **batch 32 × 梯度累积 2（有效 64）**——见第四篇的参数解剖会解释：梯度累积只"攒梯度"（与参数同形、很小），激活随图即时释放，所以比直接堆 batch 省显存。

### 13. 提速补丁

- `train.py`：`torch.set_float32_matmul_precision("high")` 开 TF32
- datamodule：`persistent_workers=True` + `prefetch_factor=3`（Windows 每轮重启 worker 开销大）

## 五、其它

- 合成时 CLI 会强制下载官方 218MB 模型：官方 `cli.py` 判断逻辑有 bug（`not hasattr(...)` 恒为 False），改成"传了 `--checkpoint_path` 就直接用"
- PyCharm 在"16GB + 训练负载"下天然吃力：data/logs 标记排除、关索引、训练期间别开
- 任务管理器里 SSD"活动时间 100%"是误导指标（NVMe 有请求即 100%），要看吞吐
- Lightning 的黄字警告（val_dataloader 建议 31 workers 等）是机械误报，可忽略

## 首次成功合成

排障链：CLI bug → 声码器权重直连 GitHub 被重置 → 走本地代理下载 `generator_v1`（53.2MB）→ 改名 `hifigan_T2_v1` 放入 `%LOCALAPPDATA%\matcha_tts\`。

```text
[🍵-1] Matcha-TTS RTF: 0.0705
[🍵-1] Matcha-TTS + VOCODER RTF: 0.0796    ← 比实时快 12.5 倍
```

RTF（实时率）= 合成耗时 ÷ 音频时长，<1 即快于实时，是衡量合成速度的核心指标。18M 小模型、有效 batch 64、约 140 轮（~2.9 万步）就能清晰合成整句，架构与数据管线验证通过。

## 几条经验

- 训练稳定性就靠三件事：每轮存 checkpoint、别让机器睡、盯住内存
- GPU 利用率 = 计算量 ÷（计算量 + 等待时间）；小模型的框架调度开销是刚性地板，硬抠没用
- 速算：1M 参数大约占 16MB 训练显存（权重 + 梯度 + Adam 状态）
- RTF 是衡量合成速度的核心指标
- 遇到问题先量化（进程 / 内存 / IO 采样）再下结论，这一条帮我躲过好几次误判
