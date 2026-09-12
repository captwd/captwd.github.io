---
title: 从 Windows 到 WSL2：一次 TTS 训练迁移与 mamba-ssm 安装实录
date: 2026-09-11 12:00:00
tags: [WSL, CUDA, Mamba, TTS, 环境配置]
categories: [深度学习实践]
description: WSL2 迁移与 mamba-ssm 安装实录：数据搬运、缓存复用与 CUDA 扩展安装的三个坑。
---

> **系列 · Matcha-TTS 训练手记** ｜ [目录](/series/) ｜ 上一篇：[ConvNeXt V2 与 MCD 震荡机制](/2026/09/07/convnext-v2-and-lr-decay-experiment/) ｜ 下一篇：[双向 Mamba2 集成](/2026/09/11/integrate-bidirectional-mamba2-into-matcha-tts/)

给一个已经在 Windows 上跑通的 Matcha-TTS 项目加 Mamba 骨干时，第一道墙不是模型，而是环境：`mamba-ssm` 官方没有 Windows wheel。于是有了这次从 Windows 到 WSL2 的完整迁移。这篇记录数据迁移、缓存复用、以及 mamba-ssm 安装中连踩的三个坑和最终解法。

## 一、为什么是 WSL2

- `mamba-ssm` / `causal-conv1d` 是带 CUDA 扩展的包，Windows 下要么没有官方 wheel，要么得装几 GB 的 MSVC 工具链自己编译
- WSL2 里就是标准 Linux，CUDA 直通 `/dev/dxg`，`nvidia-smi` 正常可用
- 代价：多一层虚拟化，kernel launch 延迟略微变高（对短序列小模型影响可感知，详见后文训练观测）

最终环境：

| 项 | 版本 |
|---|---|
| WSL | Ubuntu（WSL2） |
| GPU | RTX 5060 Laptop 8GB（sm_120 / Blackwell） |
| conda | miniconda3，环境名 `matcha` |
| Python / torch | 3.11 / **2.8.0+cu128** |
| nvcc | 12.8（在 conda 环境内） |

## 二、数据迁移：两个值得记住的坑

训练数据是 LJSpeech-1.1（13100 条 wav + 离线算好的 mel 缓存），约 5.9GB。

### 坑 1：cp 的自嵌套事故

WSL 里原先把 `data` 做成了指向 `/mnt/d` 的软链接。执行

```bash
cp -a /mnt/d/.../Matcha-TTS/data ~/projects/Matcha-TTS/data
```

时，cp 把源目录**自我嵌套**复制回了 `/mnt/d/.../data/data`，拷了 2.6 万个文件才报 `cannot copy a directory into itself`。教训：

- 拷贝前先 `rm` 掉软链接，并确认目标是真实目录
- 跨 Windows/WSL 搬大量小文件，别用 `/mnt/d` 读，用 **robocopy 从 Windows 侧直写**：

```powershell
robocopy "D:\...\Matcha-TTS\data" "\\wsl.localhost\Ubuntu\home\<user>\projects\Matcha-TTS\data" /E /MT:16 /NFL /NDL /NP
```

5.76GB / 26206 个文件，**50 秒**拷完（约 123MB/s），比 9p 读快一个数量级。

### 坑 2：pip 先把缓存目录建成了真目录

推理侧权重不必重下，直接复用 Windows 已有缓存：

- BigVGAN 权重：`~/.cache/huggingface` → `C:\Users\<user>\.cache\huggingface`
- wav2vec2 ASR（评估用）：`~/.cache/torch/hub/checkpoints` → Windows 同名目录
- HiFi-GAN T2 权重：`~/.local/share/matcha_tts` → `C:\Users\<user>\AppData\Local\matcha_tts`

但 `~/.cache/huggingface` 很可能已经被 pip 导入 `huggingface_hub` 时**创建成了空真目录**。如果软链脚本只判断"路径是否存在"，就会静默继续用空缓存，等运行时才发现要联网下载。正确姿势：

```bash
# 是符号链接才跳过；是真目录且有内容就先搬走
[ -L "$tgt" ] || { [ -e "$tgt" ] && mv "$tgt" "${tgt}.bak"; ln -s "<windows-path>" "$tgt"; }
```

## 三、mamba-ssm 安装：三次失败到 wheel 直达

### 失败 1：PyPI sdist 缺源文件

```text
ninja: error: '.../csrc/causal_conv1d.cpp', needed by '.../causal_conv1d.o', missing and no known rule
```

Packaging bug：从 PyPI 下到的 sdist 里 csrc 目录不完整。换 GitHub tag 源码。

### 失败 2：源码编译撞上 nvcc 与 glibc

GitHub 源码齐全后，两个报错接踵而至：

```text
# ① C++ 文件找不到 CUDA 头（conda 的 CUDA 布局与 cpp_extension 期望的 include 路径不一致）
fatal error: cuda_runtime_api.h: No such file or directory

# ② nvcc 12.8 与 Ubuntu 25.10 的 glibc 2.42 头文件冲突
error: exception specification is incompatible with that of previous function "cospi"
```

第二个是硬伤：CUDA 12.8 不支持这么新的 glibc，理论上要么降 glibc（动系统，不现实），要么换完整 CUDA 工具链。到这里编译路线成本已经很高。

### 解法：官方 GitHub Releases 的预编译 wheel 矩阵

mamba-ssm / causal-conv1d 的 release 为常见组合都构建了 wheel，文件名把兼容条件写得很清楚：

```text
causal_conv1d-1.7.0+cu12torch2.8cxx11abiTRUE-cp311-cp311-linux_x86_64.whl
mamba_ssm-2.2.5+cu12torch2.8cxx11abiTRUE-cp311-cp311-linux_x86_64.whl
```

选型四要素，逐个对上即可：

| 要素 | 取值来源 |
|---|---|
| CUDA 主版本 `cu12` | torch 是 cu128 |
| torch 版本 `torch2.8` | `torch.__version__` |
| C++ ABI `cxx11abiTRUE/FALSE` | `python -c "import torch; print(torch._C._GLIBCXX_USE_CXX11_ABI)"` |
| Python/平台 `cp311-linux_x86_64` | 解释器版本 |

```bash
pip install --no-deps causal_conv1d-1.7.0+cu12torch2.8cxx11abiTRUE-cp311-cp311-linux_x86_64.whl
pip install --no-deps mamba_ssm-2.2.5+cu12torch2.8cxx11abiTRUE-cp311-cp311-linux_x86_64.whl
```

国内网络下 GitHub 直连可能超时，可以准备一个代理前缀回退（例如 `https://gh-proxy.com/<原始URL>`），脚本里先直连、失败再走代理。

### 版本选择的一个雷

当时最新的是 `mamba-ssm 2.3.2`，但它的 metadata 依赖 `triton>=3.5`、`tilelang`、`quack-kernels` 等。直接用 pip 解析会**尝试把 torch 2.8 升级到更新的版本**（日志里能看到开始下载 CUDA 13 的 nvidia 组件），有破坏现有 cu128 栈的风险。对于只想用 `Mamba` / `Mamba2` 两种块的场景，选依赖干净的 `2.2.5` 更稳。

另外 `mamba_ssm` 的 `__init__` 会 import generation 工具，需要 `transformers`；实测 `transformers 4.57`（<5）与该环境里的 `diffusers 0.40` 可以共存，pip 关于 `huggingface-hub` 版本的警告可以忽略。

## 四、验证安装

```python
import torch, causal_conv1d, mamba_ssm
print(causal_conv1d.__version__, mamba_ssm.__version__)

from causal_conv1d import causal_conv1d_fn
x = torch.randn(2, 64, 100, device="cuda", dtype=torch.float16, requires_grad=True)
w = torch.randn(64, 4, device="cuda", dtype=torch.float16, requires_grad=True)
y = causal_conv1d_fn(x, w, bias=None, activation="silu"); y.sum().backward()
print("causal_conv1d ok", tuple(y.shape))

from mamba_ssm import Mamba, Mamba2
for cls, d_state in ((Mamba, 16), (Mamba2, 64)):
    m = cls(d_model=128, d_state=d_state).cuda().to(torch.float16)
    inp = torch.randn(2, 50, 128, device="cuda", dtype=torch.float16, requires_grad=True)
    inp_out = m(inp); inp_out.sum().backward()
    print(cls.__name__, "fwd/bwd ok")
```

前向 + 反向都在 GPU 上跑通，环境就算齐了。

## 小结

- 大数据量跨平台搬运用 robocopy 直写 `\\wsl.localhost`，别用 `/mnt` 读
- 复用 Windows 的权重缓存时，先处理 pip 无意间建出来的空目录
- 装 CUDA 扩展先去官方 releases 找匹配的 wheel（cu / torch / abi / python 四个条件），编译放到最后
- 装 mamba 时注意新版本可能把 torch 整个升级掉
