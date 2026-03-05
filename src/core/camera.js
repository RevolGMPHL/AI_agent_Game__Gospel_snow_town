/**
 * 福音镇 - Camera 摄像机
 * 跟随目标、视口计算、缩放、边界限制
 * 挂载到 GST.Camera
 */
(function() {
    'use strict';
    const GST = window.GST;

class Camera {
    constructor(w, h) {
        this.x = 0;
        this.y = 0;
        this.width = w;
        this.height = h;
        // 平滑跟随
        this.targetX = 0;
        this.targetY = 0;
        this.smoothSpeed = 3; // 值越大跟随越快
    }

    /** 立即跳到目标 */
    jumpTo(tx, ty, mapW, mapH) {
        this.targetX = tx - this.width / 2;
        this.targetY = ty - this.height / 2;
        this.targetX = Math.max(0, Math.min(this.targetX, mapW - this.width));
        this.targetY = Math.max(0, Math.min(this.targetY, mapH - this.height));
        this.x = this.targetX;
        this.y = this.targetY;
    }

    /** 平滑跟随 */
    followSmooth(tx, ty, mapW, mapH, dt) {
        this.targetX = tx - this.width / 2;
        this.targetY = ty - this.height / 2;
        this.targetX = Math.max(0, Math.min(this.targetX, mapW - this.width));
        this.targetY = Math.max(0, Math.min(this.targetY, mapH - this.height));
        const lerp = 1 - Math.exp(-this.smoothSpeed * dt);
        this.x += (this.targetX - this.x) * lerp;
        this.y += (this.targetY - this.y) * lerp;
    }

    /** Debug 模式: WASD 直接移动 */
    moveBy(dx, dy, mapW, mapH) {
        this.x += dx;
        this.y += dy;
        this.x = Math.max(0, Math.min(this.x, mapW - this.width));
        this.y = Math.max(0, Math.min(this.y, mapH - this.height));
        this.targetX = this.x;
        this.targetY = this.y;
    }
}


// ============ Game 主类 ============


    GST.Camera = Camera;
})();
