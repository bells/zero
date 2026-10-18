# iPhone Safari 实机记录

设备计划：iPhone 17 Pro / iOS 27.0.1（用户截图仅保留型号和系统）。
Safari 版本、实际测试和内存测量尚未记录。本文件是步骤，不是通过证据。

## 启动与访问

在仓库根目录运行，先保证已有合成语料、源码重建和许可材料缓存：

```sh
IMAGE_CODEC_DROP_IN_BINDING="$PWD/website/output/image-codecs/rebuild/libheif-rebuilt.js" pnpm --dir website experiment:images
pnpm --dir website experiment:images:licenses
pnpm --dir website experiment:images:serve
```

最后一条打印本机私有局域网 IPv4 地址。iPhone 与 Mac 连接同一可信 Wi-Fi，
用 Safari 打开该 HTTP 地址的 `/image-lab/`。不要使用 file://、localhost、
127.0.0.1 或手机视口仿真。服务仅绑定一个已分配的私有地址，按材料 manifest
白名单提供实验页面、合成样本和源码许可文件；没有上传端点或访问日志。
仅支持 GET/HEAD，不允许跨来源 Origin、查询参数、路径穿越或任意项目文件。
不需要 HTTPS-only 的 File System Access / Clipboard API；是否能在真实 Safari
执行仍需本次实测。若 Wi-Fi 隔离、Mac 防火墙或 VPN 阻止访问，先解决局域网连接，
不要因此开公网隧道。Ctrl+C 停止服务。多网络接口时可用已分配的私有地址
设置 `IMAGE_LAB_HOST`，不要使用 0.0.0.0。

## 建议执行顺序

1. 保持“同时编码”关闭，点“检查 JPEG / WebP / PNG / ZIP”，记录 pngExact / zipExact。
2. 点“解码合成 12MP HEIC”，完成后再点一次。记录两次 decodeMs / elapsedMs、尺寸、
   是否页面重载/退出。每次均为新 Worker，第二次不代表常驻解码器热身。
3. 勾选“同时编码”，再次运行 12MP。记录 encodeMs / zipMs、JPEG / ZIP 字节、保留后
   页面是否正常。依次点下载，在 Safari 下载列表或“文件”实际打开 JPEG 和 ZIP，
   解压后比较图像。明确记录系统行为，不将下载当作保存到相册。
4. 显式打开预览，再运行三个旋转样本（会替换上一份结果）。方向预期见下表。
   新处理、清空或离页会撤销下载 URL、终止任务、释放当前引用；不保留历史批次。
5. 点“主图检查后自动终止 48MP”；另启动真实 HEIC 解码/编码后点“取消当前任务”。
   再处理 12MP 验证可恢复。启动 60 秒超时测试，可先手动取消，再完整等一次验证 timeout。
6. 只有 12MP 正常且愿意继续时，勾选 48MP 实验并单次运行。分别记录解码、可选编码/
   下载的实际结果；发生重载/退出就记录失败，不反复强行重试。
7. 可选：从“文件”选一张原始相机 HEIC，确认实际字节为 HEIF candidate 后明确点击解码。
   再通过照片选择器比较交付格式；JPEG bytes 不算原始 HEIC 验证。照片不离开当前浏览器，
   不提交原片、文件名、EXIF、位置、设备序列号或私人截图作为项目证据。

原样本 TL/TR/BR/BL 的红绿象限为：高红低绿、低红低绿、低红高绿、高红高绿；
蓝色是纹理，不作单色承诺。iROT 逆时针旋转后：

| 旋转 | TL | TR | BR | BL | 输出尺寸 |
| --- | --- | --- | --- | --- | --- |
| 90° | 原 TR | 原 BR | 原 BL | 原 TL | 3024×4032 |
| 180° | 原 BR | 原 BL | 原 TL | 原 TR | 4032×3024 |
| 270° | 原 BL | 原 TL | 原 TR | 原 BR | 3024×4032 |

## 脱敏反馈模板

- Safari / iOS 版本（只记版本）：
- 首次 / 第二次 12MP decodeMs：
- 12MP JPEG encodeMs / zipMs / 字节：
- 48MP：未测试 / 正常 / 拒绝（错误码）/ 重载或退出：
- 三个旋转的方向 / 尺寸：
- 手动取消 / 自动终止 / 超时 / 再次处理：
- JPEG 下载后能否打开；ZIP 能否解压且图像一致；系统保存入口：
- 原片实际格式 / 选择器交付格式（不含文件名）：
- 可见色彩、透明样本与其他异常：
- 内存测量方法、基线/峰值/取消后数据；若无仪器写“未测”：

网页只报告时间、RGBA / Blob 大小和应用引用释放。没有 Safari 进程测量时，
峰值与物理回收必须写“未测”。需要连接 Mac Safari Web Inspector 或可用的进程
测量工具，记录具体方法、阶段与观察窗口；JS heap、流畅运行或 terminate 均不能替代。

实验上限 32 MiB 源文件、5000 万像素、60 秒和 JPEG 质量 75 均不是生产策略。
恶意低报 ispe 的样本表明两个头部尺寸读取都可能低报，库内部像素分配不受这些
检查完全约束。任务 1.5/1.6、7.3、9.3 只有实际对应证据具备后才能勾选。
