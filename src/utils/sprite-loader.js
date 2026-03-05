/**
 * 福音镇 - SpriteLoader 精灵加载器
 * 挂载到 GST.SpriteLoader / window.SpriteLoader
 */
(function() {
    'use strict';
    const GST = window.GST;

/**
 * sprite-loader.js — 福音雪镇 素材加载器
 * 
 * 功能：
 *   1. 根据 sprite-manifest.json 批量预加载所有 PNG 素材
 *   2. 提供统一的 getImage(category, name) 接口
 *   3. 素材未加载完毕时 graceful fallback（返回 null，由绘制端回退到代码绘制）
 *   4. 支持运行时热替换（替换文件后刷新页面即可）
 * 
 * 使用方式：
 *   // 在 game.js 初始化时
 *   await SpriteLoader.load();
 *   
 *   // 在绘制时
 *   const img = SpriteLoader.get('tiles', 'snow');
 *   if (img) ctx.drawImage(img, x, y, 32, 32);
 */

const SpriteLoader = (() => {
    // 素材存储
    const _images = {
        tiles: {},
        decorations: {},
        buildings: {},
        maps: {},
    };

    // 加载状态
    let _loaded = false;
    let _loading = false;
    let _totalCount = 0;
    let _loadedCount = 0;
    let _manifest = null;
    let _enabled = true;  // 是否启用图片素材（可以通过设置关闭，回退到纯代码绘制）

    /**
     * 加载单张图片，返回 Promise<Image>
     */
    function _loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.warn(`[SpriteLoader] 加载失败: ${src}`);
                resolve(null);  // 失败不阻塞，返回 null
            };
            img.src = src + '?v=' + Date.now();  // 防缓存（开发期间）
        });
    }

    /**
     * 批量加载一个分类下的所有素材
     */
    async function _loadCategory(category, items) {
        const promises = [];
        for (const [name, info] of Object.entries(items)) {
            const p = _loadImage(info.file).then(img => {
                if (img) {
                    _images[category][name] = img;
                }
                _loadedCount++;
            });
            promises.push(p);
            _totalCount++;
        }
        await Promise.all(promises);
    }

    /**
     * 底图自动缩放：如果加载的图片尺寸与 manifest 中声明的 size 不一致，
     * 使用离屏 Canvas 缩放到目标尺寸。这样无论换什么尺寸的底图都能自动适配。
     * @param {HTMLImageElement} img - 原始底图
     * @param {number[]} targetSize - [宽, 高]，来自 manifest.maps.*.size
     * @param {string} name - 底图名称（用于日志）
     * @returns {HTMLCanvasElement|HTMLImageElement} 缩放后的 canvas 或原图
     */
    function _resizeMapIfNeeded(img, targetSize, name) {
        if (!targetSize || !Array.isArray(targetSize) || targetSize.length < 2) {
            return img; // 没配置目标尺寸，直接返回原图
        }
        const [tw, th] = targetSize;
        if (img.width === tw && img.height === th) {
            console.log(`[SpriteLoader] 底图 ${name}: ${img.width}×${img.height} 尺寸匹配，无需缩放`);
            return img; // 尺寸已匹配，无需缩放
        }
        // 尺寸不匹配，用离屏 Canvas 缩放
        console.log(`[SpriteLoader] 底图 ${name}: ${img.width}×${img.height} → ${tw}×${th} 自动缩放`);
        const offscreen = document.createElement('canvas');
        offscreen.width = tw;
        offscreen.height = th;
        const offCtx = offscreen.getContext('2d');
        // 使用高质量插值
        offCtx.imageSmoothingEnabled = true;
        offCtx.imageSmoothingQuality = 'high';
        offCtx.drawImage(img, 0, 0, tw, th);
        return offscreen;
    }

    return {
        /**
         * 加载所有素材（异步）
         * @returns {Promise<boolean>} 是否全部加载成功
         */
        async load() {
            if (_loaded || _loading) return _loaded;
            _loading = true;

            try {
                // 1. 加载清单文件
                const resp = await fetch('asset/sprite-manifest.json?v=' + Date.now());
                if (!resp.ok) {
                    console.warn('[SpriteLoader] sprite-manifest.json 不存在，使用纯代码绘制');
                    _loading = false;
                    _enabled = false;
                    return false;
                }
                _manifest = await resp.json();

                console.log('[SpriteLoader] 开始加载素材...');

                // 2. 并行加载所有分类
                const loadTasks = [
                    _loadCategory('tiles', _manifest.tiles || {}),
                    _loadCategory('decorations', _manifest.decorations || {}),
                    _loadCategory('buildings', _manifest.buildings || {}),
                ];

                // 3. 加载底图（maps 分类 — 优先 clean 版本，fallback 到带标注版）
                if (_manifest.maps) {
                    for (const [name, info] of Object.entries(_manifest.maps)) {
                        const cleanFile = info.file;           // village_base_clean.png
                        const annotatedFile = info.file_annotated; // village_base.png
                        const targetSize = info.size;          // [1600, 1280] 期望目标尺寸
                        const p = _loadImage(cleanFile).then(img => {
                            if (img) {
                                _images.maps[name] = _resizeMapIfNeeded(img, targetSize, name);
                                _loadedCount++;
                                return;
                            }
                            // clean 版本不存在，尝试带标注版
                            if (annotatedFile) {
                                return _loadImage(annotatedFile).then(img2 => {
                                    if (img2) {
                                        _images.maps[name] = _resizeMapIfNeeded(img2, targetSize, name);
                                        console.log(`[SpriteLoader] 底图 ${name}: 使用带标注版 (clean 版不存在)`);
                                    }
                                    _loadedCount++;
                                });
                            }
                            _loadedCount++;
                        });
                        loadTasks.push(p);
                        _totalCount++;
                    }
                }

                await Promise.all(loadTasks);

                _loaded = true;
                _loading = false;
                console.log(`[SpriteLoader] 加载完成: ${_loadedCount}/${_totalCount} 张素材`);
                return true;
            } catch (e) {
                console.warn('[SpriteLoader] 加载异常，回退到纯代码绘制:', e);
                _loading = false;
                _enabled = false;
                return false;
            }
        },

        /**
         * 获取素材图片
         * @param {string} category - 分类: 'tiles' | 'decorations' | 'buildings'
         * @param {string} name - 素材名称（对应 manifest 中的 key）
         * @returns {HTMLImageElement|null} 图片对象，未加载时返回 null
         */
        get(category, name) {
            if (!_enabled || !_loaded) return null;
            return _images[category]?.[name] || null;
        },

        /**
         * 判断是否启用图片素材
         */
        get enabled() {
            return _enabled && _loaded;
        },

        /**
         * 手动启用/禁用图片素材
         */
        set enabled(val) {
            _enabled = !!val;
        },

        /**
         * 获取加载进度 (0~1)
         */
        get progress() {
            return _totalCount > 0 ? _loadedCount / _totalCount : 0;
        },

        /**
         * 获取清单信息
         */
        get manifest() {
            return _manifest;
        },

        /**
         * 获取加载状态
         */
        get isLoaded() {
            return _loaded;
        },

        /**
         * 获取底图 Image 对象
         * @param {string} name - 底图名称（如 'village_base'）
         * @returns {HTMLImageElement|null}
         */
        getMap(name) {
            if (!_enabled || !_loaded) return null;
            return _images.maps?.[name] || null;
        },

        /**
         * 绘制地砖（带 fallback）
         * @param {CanvasRenderingContext2D} ctx
         * @param {string} tileName - 素材名
         * @param {number} x - 像素坐标 x
         * @param {number} y - 像素坐标 y
         * @param {number} size - tile 尺寸 (默认 32)
         * @returns {boolean} 是否使用了图片绘制
         */
        drawTile(ctx, tileName, x, y, size = 32) {
            const img = this.get('tiles', tileName);
            if (img) {
                ctx.drawImage(img, x, y, size, size);
                return true;
            }
            return false;
        },

        /**
         * 绘制装饰物（带 fallback）
         * @param {CanvasRenderingContext2D} ctx
         * @param {string} decoName - 装饰物名
         * @param {number} x - 像素坐标 x
         * @param {number} y - 像素坐标 y
         * @returns {boolean} 是否使用了图片绘制
         */
        drawDecoration(ctx, decoName, x, y) {
            const img = this.get('decorations', decoName);
            if (img) {
                ctx.drawImage(img, x, y);
                return true;
            }
            return false;
        },

        /**
         * 绘制建筑（带 fallback）
         * @param {CanvasRenderingContext2D} ctx
         * @param {string} buildingName - 建筑名
         * @param {number} x - 像素坐标 x
         * @param {number} y - 像素坐标 y（屋顶顶部）
         * @param {number} w - 像素宽度
         * @param {number} h - 像素高度
         * @returns {boolean} 是否使用了图片绘制
         */
        drawBuilding(ctx, buildingName, x, y, w, h) {
            const img = this.get('buildings', buildingName);
            if (img) {
                ctx.drawImage(img, x, y, w, h);
                return true;
            }
            return false;
        },
    };
})();

// 如果在浏览器环境中，挂载到 window
if (typeof window !== 'undefined') {
    window.SpriteLoader = SpriteLoader;
    GST.SpriteLoader = SpriteLoader;
}

})();
