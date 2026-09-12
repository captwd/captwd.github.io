---
title: 离线预处理缓存：把重复的 CPU 计算移出训练循环
date: 2026-09-04 12:00:00
tags: [Matcha-TTS, TTS, 性能优化, 数据管线]
categories: [深度学习实践]
description: 离线预处理缓存的实现：方案设计、逐位一致性验证，以及每轮实际省下的时间。
---

> **系列 · Matcha-TTS 训练手记** ｜ [目录](/series/) ｜ 下一篇：[Windows 从零训练踩坑全集](/2026/09/05/matcha-tts-windows-training-pitfalls/)

训练一个语音模型时，最容易被忽视的浪费是：**每个 epoch 都把同一批音频重新算一遍梅尔谱、重新做一遍音素化**。这个项目里 13100 条 LJSpeech 数据，每轮训练都要在 CPU 上重复上千次 FFT 和调用 espeak，纯属内耗。这篇记录我做的离线预处理缓存方案：思路、实现、验证和收益。

## 一、问题：训练循环里藏着一个重复劳动

原始 Matcha-TTS 的数据管线是这样的（每个 epoch、每条样本）：

```text
读 wav → 短时傅里叶变换 → mel 滤波器组 → 取对数  (CPU 密集)
文本 → 清洗/规范化 → espeak 音素化              (调用外部进程，慢)
        ↓
    collate 变长序列补零 → 送 GPU
```

而这两步的输入是**确定性的**——同一批数据、同一套参数，结果永远一样。在 GPU 上训练时，CPU 还在为下一批数据"现磨"这些特征，直接后果是：

- 每轮训练时间被拉长（数据准备和 GPU 计算争抢）
- CPU 利用率下不来，磁盘持续读原始 wav
- GPU 经常在等数据，利用率上不去

## 二、方案：离线算一次，训练只读结果

核心思路：**把预处理从"训练循环内"挪到"训练循环外"**，训练时只做"读现成文件 + collate"。

### 组件一：离线预处理脚本（新增）

`scripts/preprocess_dataset.py` 负责一次性把整个数据集处理完：

| 能力 | 设计 |
|---|---|
| 存储 | 梅尔谱存 `cache/mel/*.npy`；音素序列存 `cache/phonemes.json`；处理参数存 `cache/meta.json` |
| 并行 | 多进程（实测 8 进程） |
| 断点续跑 | 已处理的样本跳过，中断后重跑不浪费 |
| 参数校验 | `meta.json` 记录 mel 参数，供训练时比对 |

13100 条数据，**8 进程处理仅 47 秒**，产出约 2.2GB 缓存。

### 组件二：数据集类的缓存命中逻辑（改造）

`TextMelDataset` 增加一层判断：

```text
启动时读取 cache/meta.json
  ├─ 参数与当前配置一致 → 启用缓存
  └─ 不一致           → 自动禁用 + 告警（回退现场计算）
每条样本：
  ├─ 命中缓存 → 直接读 .npy / phonemes.json
  └─ 未命中   → 回退到原来的现场计算
```

两个设计细节很关键：

1. **参数不一致时自动禁用而不是报错**——换采样率/hop/ mel 维数时不会静默用错缓存，也不会把训练卡死
2. **未命中自动回退**——缓存不完整时训练照样能跑，只是慢一点

## 三、验证：缓存必须与现场计算逐位一致

这是最容易翻车的地方：如果缓存和现场计算有细微不一致，模型学到的分布就悄悄变了，而且很难发现。

验证方法：抽 6 个样本，分别在"缓存路径"和"现场计算路径"下取出音素序列、清洗文本和梅尔谱，逐个做**逐位比对**——结果完全一致。

## 四、收益：每轮省下约 30 秒，磁盘"退休"

| 指标 | 改善前 | 改善后 |
|---|---|---|
| 每轮训练时间 | — | 每轮大约快 30 秒 |
| 磁盘读训练数据 | 每轮持续读 wav | 首轮读一次后进入页缓存，之后几乎为零 |
| CPU 数据准备负载 | 持续有 mel 计算 | 只剩 collate |
| worker 内存 | 每个 worker 持数据集 + 现算 | 可降到 2 个（验证集 0 个） |

关于"磁盘退休"的原理值得一提：操作系统会把读过的文件内容自动留在空闲内存里（页缓存），几 GB 的 `.npy` 第一次读进来之后，后续每个 epoch 都是**纯内存命中**。所以你会看到一个反直觉的现象：训练一整晚，磁盘几乎不干活。

## 五、踩过的两个坑

### 坑 1：运行预处理脚本前必须设置 espeak 环境变量

脚本 `import cleaners` 时就会初始化 phonemizer，需要系统级 espeak-ng 与 `PHONEMIZER_ESPEAK_LIBRARY` / `PHONEMIZER_ESPEAK_PATH`。忘了设就会在启动阶段直接报错。

### 坑 2：缓存目录是训练必需品，别乱挪

我曾把 cache 文件夹剪切到项目外"想省空间"，结果训练直接找不到缓存。同盘移动并不省空间，缓存是训练依赖——**它就像编译产物，可以删可以重建，但训练时必须在对的位置**。

## 小结

这个改动的核心很简单：把确定性的 CPU 计算从训练循环里挪出去，只算一次。除了省时间，它还顺带解决了三件事：

1. 磁盘 IO 从持续负载降到几乎为零（页缓存接管）
2. CPU 从"边算边喂"变成只负责调度
3. 内存压力下降，worker 数量可以砍到最小

代码量不大，但把训练从"数据饥饿"里解放了出来，是整个项目里性价比最高的一处改动。

## 关键代码

### 1. 预处理脚本：单个样本的 mel + 音素

计算逻辑与 `TextMelDataset.get_mel` / `get_text` 逐行保持一致，这样缓存和现场计算的结果才可比。

```python
def process_one(item, params):
    filepath, text = item
    stem = Path(filepath).stem

    # 断点续跑：已经算过的样本直接跳过
    if (params["mel_dir"] / f"{stem}.npy").exists() and stem in params["done"]:
        return stem, None

    # 梅尔频谱
    audio, sr = ta.load(filepath)
    mel = mel_spectrogram(
        audio,
        params["n_fft"], params["n_feats"], params["sample_rate"],
        params["hop_length"], params["win_length"],
        params["f_min"], params["f_max"], center=False,
    ).squeeze()
    mel = normalize(mel, params["mel_mean"], params["mel_std"])
    np.save(params["mel_dir"] / f"{stem}.npy", mel.cpu().numpy().astype(np.float32))

    # 文本 -> 音素 ID
    seq, cleaned = text_to_sequence(text, list(params["cleaners"]))
    if params["add_blank"]:
        seq = intersperse(seq, 0)
    return stem, {"x": [int(i) for i in seq], "text": cleaned}
```

### 2. 多进程跑完，把参数写进 meta.json

`meta.json` 是给训练侧做参数校验用的，避免配置改了还在用旧缓存。

```python
with ProcessPoolExecutor(max_workers=args.workers) as ex:
    for stem, result in tqdm(ex.map(process_one, todo, [params] * len(todo)), total=len(todo)):
        if result is not None:
            phonemes[stem] = result

ph_path.write_text(json.dumps(phonemes, ensure_ascii=False), encoding="utf-8")
meta = {k: v for k, v in params.items() if k not in ("mel_dir", "done")}
meta["version"] = 1
(cache_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
```

### 3. 训练侧：启动时校验参数，对不上就禁用缓存

```python
def _load_preprocess_cache(self):
    if not (meta_path.exists() and ph_path.exists()):
        return False, None

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    expected = {
        "n_fft": self.n_fft, "n_feats": self.n_mels, "sample_rate": self.sample_rate,
        "hop_length": self.hop_length, "win_length": self.win_length,
        "f_min": self.f_min, "f_max": self.f_max,
        "mel_mean": self.data_parameters["mel_mean"], "mel_std": self.data_parameters["mel_std"],
        "cleaners": self.cleaners, "add_blank": self.add_blank,
    }
    for key, value in expected.items():
        if not _match(meta.get(key), value):          # 数值用 math.isclose，其余直接比较
            warnings.warn(f"预处理缓存参数与当前配置不一致({key})，已禁用缓存，将现场计算")
            return False, None

    return True, json.loads(ph_path.read_text(encoding="utf-8"))
```

### 4. 取数据：优先读缓存，未命中回退原逻辑

```python
def get_mel(self, filepath):
    cache_file = self.cache_dir / "mel" / f"{Path(filepath).stem}.npy"
    if self._cache_ok and cache_file.exists():
        return torch.from_numpy(np.load(cache_file))
    ...  # 原逻辑：读 wav -> FFT -> mel

# get_datapoint 里的音素部分
if self.phoneme_cache is not None and utt_id in self.phoneme_cache:
    cached = self.phoneme_cache[utt_id]
    text, cleaned_text = torch.IntTensor(cached["x"]), cached["text"]
else:
    text, cleaned_text = self.get_text(text, add_blank=self.add_blank)
```

完整实现见仓库里的 `scripts/preprocess_dataset.py` 和 `matcha/data/text_mel_datamodule.py`。
