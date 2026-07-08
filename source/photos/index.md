---
title: 相册
date: 2026-07-08 00:00:00
type: photos
---

<div class="photo-gallery">
  <div class="photo-item">
    <img src="/img/泡泡.webp" alt="泡泡">
    <div class="photo-caption">泡泡</div>
  </div>
  <div class="photo-item">
    <img src="/img/泡泡 - 副本.png" alt="泡泡副本">
    <div class="photo-caption">泡泡副本</div>
  </div>
  <div class="photo-item">
    <img src="/img/index-bg.jpg" alt="首页背景">
    <div class="photo-caption">首页背景</div>
  </div>
  <div class="photo-item">
    <img src="/img/me.png" alt="头像">
    <div class="photo-caption">头像</div>
  </div>
</div>

<style>
.photo-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
  padding: 20px 0;
}

.photo-item {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.photo-item:hover {
  transform: scale(1.05);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.photo-item img {
  width: 100%;
  height: 200px;
  object-fit: cover;
  display: block;
}

.photo-caption {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
  color: white;
  padding: 20px 15px 10px;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.photo-item:hover .photo-caption {
  opacity: 1;
}
</style>
