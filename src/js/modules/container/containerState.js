/**
 * containerState.js
 * 
 * 這個模組統一管理與容器相關的共享狀態。
 * 包含當前容器的設定、門的尺寸規格等。
 * 這使得狀態可以在不同模組之間輕鬆導入和存取，而無需透過 props 或事件傳遞。
 */

// 當前容器狀態
export let currentContainer = {
    shape: 'cube',
    dimensions: { width: 120, height: 120, depth: 120 },
    doors: [] // 多門
};

// 門的尺寸規格
export const DOOR_SIZES = {
    'human': { w: 12, h: 22 }, // 1.2m x 2.2m
    'forklift': { w: 30, h: 40 }, // 3m x 4m
    'truck': { w: 40, h: 50 } // 4m x 5m
};

// 不同形狀容器可用的門表面
export const DOOR_FACES = {
    cube: [
        { value: 'front', label: '前門 (Front)' },
        { value: 'back', label: '後門 (Back)' },
        { value: 'left', label: '左側門 (Left)' },
        { value: 'right', label: '右側門 (Right)' },
    ],
    'l-shape': [
        { value: 'main_front', label: '主體-前門 (Main Front)' },
        { value: 'main_back', label: '主體-後門 (Main Back)' },
        { value: 'main_left', label: '主體-左側 (Main Left)' },
        { value: 'main_right', label: '主體-右側 (Main Right)' },
        { value: 'ext_front', label: '延伸-前門 (Ext Front)' },
        { value: 'ext_back', label: '延伸-後門 (Ext Back)' },
        { value: 'ext_left', label: '延伸-左側 (Ext Left)' },
        { value: 'ext_right', label: '延伸-右側 (Ext Right)' },
    ]
};

// 允許其他模組修改狀態
export function updateCurrentContainer(patch) {
  if (!patch) return;

  // Update shape if provided
  if (patch.shape !== undefined) {
    currentContainer.shape = patch.shape;
  }

  // Update dimensions if provided
  if (patch.dimensions) {
    Object.assign(currentContainer.dimensions, patch.dimensions);
  }

  // Update doors if provided (replace array reference)
  if (patch.doors !== undefined) {
    currentContainer.doors = patch.doors;
  }
}
