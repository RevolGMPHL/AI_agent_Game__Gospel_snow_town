/**
 * 福音镇 - A* 寻路算法
 */
(function() {
    'use strict';
    const GST = window.GST;

    function findPath(startX, startY, goalX, goalY, map, extraBlocked) {
        const start = { x: Math.floor(startX), y: Math.floor(startY) };
        let goal = { x: Math.floor(goalX), y: Math.floor(goalY) };
    
        // extraBlocked: Set of "x,y" strings，额外标记为不可通行的格子（如其他NPC占据的位置）
        const blockedSet = extraBlocked || null;
    
        // 目标修正：如果目标不可通行，搜索最近可通行点
        const goalCx = goal.x * GST.TILE + GST.TILE / 2;
        const goalCy = goal.y * GST.TILE + GST.TILE / 2;
        if (map.isSolid(goalCx, goalCy)) {
            let best = null, bestDist = Infinity;
            for (let dy = -6; dy <= 6; dy++) {
                for (let dx = -6; dx <= 6; dx++) {
                    const nx = goal.x + dx, ny = goal.y + dy;
                    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
                    if (map.isSolid(nx * GST.TILE + GST.TILE / 2, ny * GST.TILE + GST.TILE / 2)) continue;
                    const d = Math.abs(dx) + Math.abs(dy);
                    if (d < bestDist) { bestDist = d; best = { x: nx, y: ny }; }
                }
            }
            if (best) goal = best;
            else return null;
        }
    
        const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        const key = n => `${n.x},${n.y}`;
    
        const openSet = [{ node: start, f: 0, g: 0 }];
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        gScore.set(key(start), 0);
    
        while (openSet.length > 0) {
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift();
            const ck = key(current.node);
    
            if (current.node.x === goal.x && current.node.y === goal.y) {
                const path = [];
                let temp = current.node;
                while (temp) { path.unshift(temp); temp = cameFrom.get(key(temp)); }
                return path;
            }
    
            closedSet.add(ck);
    
            const neighbors = [
                { x: current.node.x + 1, y: current.node.y },
                { x: current.node.x - 1, y: current.node.y },
                { x: current.node.x, y: current.node.y + 1 },
                { x: current.node.x, y: current.node.y - 1 }
            ];
    
            for (const nb of neighbors) {
                const nk = key(nb);
                if (nb.x < 0 || nb.y < 0 || nb.x >= map.width || nb.y >= map.height || closedSet.has(nk)) continue;
                if (map.isSolid(nb.x * GST.TILE + GST.TILE / 2, nb.y * GST.TILE + GST.TILE / 2)) continue;
                // 额外障碍物检查（其他NPC占据的格子）
                if (blockedSet && blockedSet.has(`${nb.x},${nb.y}`)) continue;
    
                // 圆形碰撞额外检查
                if (map.circleObstacles) {
                    const ngx = nb.x + 0.5, ngy = nb.y + 0.5;
                    let blocked = false;
                    for (const obs of map.circleObstacles) {
                        if (Math.sqrt(Math.pow(ngx - obs.cx, 2) + Math.pow(ngy - obs.cy, 2)) < obs.r + 0.3) {
                            blocked = true; break;
                        }
                    }
                    if (blocked) continue;
                }
    
                const tg = current.g + 1;
                if (!gScore.has(nk) || tg < gScore.get(nk)) {
                    cameFrom.set(nk, current.node);
                    gScore.set(nk, tg);
                    const f = tg + heuristic(nb, goal);
                    if (!openSet.find(n => key(n.node) === nk)) {
                        openSet.push({ node: nb, f, g: tg });
                    }
                }
            }
        }
        return null;
    }

    GST.findPath = findPath;
})();
