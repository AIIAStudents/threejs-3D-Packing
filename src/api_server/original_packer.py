import time
import random
import math
import itertools
from typing import Dict, List, Tuple, Optional

# This file now contains the original Python algorithm implementation.

class BLF_SA_Algorithm:
    """BLF (Bottom-Left-Fill) + SA (Simulated Annealing) Algorithm"""
    
    def __init__(self, container: Dict, initial_obstacles: List[Dict] = None):
        self.container = container
        self.container['x_max'] = self.container.get('x', 0) + self.container['width']
        self.container['y_max'] = self.container.get('y', 0) + self.container['height']
        self.container['z_max'] = self.container.get('z', 0) + self.container['depth']
        self.total_container_volume = self.container['width'] * self.container['height'] * self.container['depth']
        self.min_gap = 0.0
        self.initial_obstacles = initial_obstacles or []

    def _get_rotations(self, obj: Dict) -> List[Dict]:
        dims = obj.get('dimensions') or obj.get('size') or {}
        d = [dims.get('width', 1), dims.get('height', 1), dims.get('depth', 1)]
        if d[0] == d[1] and d[1] == d[2]:
            return [{'width': d[0], 'height': d[1], 'depth': d[2]}]
        unique_permutations = set(itertools.permutations(d))
        return [{'width': p[0], 'height': p[1], 'depth': p[2]} for p in unique_permutations]

    def calculate_cost(self, packed_objects: List[Dict]) -> Tuple[int, float]:
        if not self.total_container_volume: return 0, 0.0
        actual_packed = [obj for obj in packed_objects if not obj.get('is_obstacle')]
        count = len(actual_packed)
        total_packed_volume = sum((obj['dimensions']['width'] * obj['dimensions']['height'] * obj['dimensions']['depth']) for obj in actual_packed)
        obstacle_volume = sum((obs['dimensions']['width'] * obs['dimensions']['height'] * obs['dimensions']['depth']) for obs in self.initial_obstacles)
        effective_container_volume = self.total_container_volume - obstacle_volume
        utilization = (total_packed_volume / effective_container_volume) * 100 if effective_container_volume > 0 else 0
        return (count, utilization)

    def _can_place_at(self, obj_dims: Dict, position: Dict, packed_objects: List[Dict]) -> bool:
        gap = self.min_gap
        obj_x_max = position['x'] + obj_dims['width']
        obj_y_max = position['y'] + obj_dims['height']
        obj_z_max = position['z'] + obj_dims['depth']

        if not (position['x'] >= self.container.get('x', 0) and obj_x_max <= self.container['x_max'] and
                position['y'] >= self.container.get('y', 0) and obj_y_max <= self.container['y_max'] and
                position['z'] >= self.container.get('z', 0) and obj_z_max <= self.container['z_max']):
            return False

        for packed in packed_objects:
            packed_dims = packed['dimensions']
            packed_pos = packed['position']
            if not (
                position['x'] >= packed_pos['x'] + packed_dims['width'] + gap or
                position['x'] + obj_dims['width'] + gap <= packed_pos['x'] or
                position['y'] >= packed_pos['y'] + packed_dims['height'] + gap or
                position['y'] + obj_dims['height'] + gap <= packed_pos['y'] or
                position['z'] >= packed_pos['z'] + packed_dims['depth'] + gap or
                position['z'] + obj_dims['depth'] + gap <= packed_pos['z']
            ):
                return False
        return True

    def _find_best_position_for_item(self, obj: Dict, packed_objects: List[Dict]) -> Optional[Tuple[Dict, Dict]]:
        valid_placements = []
        for rot_dims in self._get_rotations(obj):
            possible_positions = [{'x': 0, 'y': 0, 'z': 0}]
            for packed in packed_objects:
                p_dims, p_pos = packed['dimensions'], packed['position']
                possible_positions.extend([
                    {'x': p_pos['x'] + p_dims['width'], 'y': p_pos['y'], 'z': p_pos['z']},
                    {'x': p_pos['x'], 'y': p_pos['y'] + p_dims['height'], 'z': p_pos['z']},
                    {'x': p_pos['x'], 'y': p_pos['y'], 'z': p_pos['z'] + p_dims['depth']},
                ])
            for candidate_pos in possible_positions:
                final_y = 0
                support_objects = [p for p in packed_objects if (p['position']['x'] < candidate_pos['x'] + rot_dims['width'] and candidate_pos['x'] < p['position']['x'] + p['dimensions']['width'] and p['position']['z'] < candidate_pos['z'] + rot_dims['depth'] and candidate_pos['z'] < p['position']['z'] + p['dimensions']['depth'])]
                if support_objects: final_y = max(p['position']['y'] + p['dimensions']['height'] for p in support_objects)
                final_pos = {'x': candidate_pos['x'], 'y': final_y, 'z': candidate_pos['z']}
                if self._can_place_at(rot_dims, final_pos, packed_objects):
                    valid_placements.append({'position': final_pos, 'dimensions': rot_dims})
        if not valid_placements: return None, None
        best_placement = sorted(valid_placements, key=lambda p: (p['position']['y'], p['position']['z'], p['position']['x']))[0]
        return best_placement['position'], best_placement['dimensions']

    def _blf_pack_with_rotation(self, objects: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
        packed_objects, unpacked_objects = self.initial_obstacles.copy(), []
        for obj in objects:
            if 'dimensions' not in obj or not obj['dimensions']: obj['dimensions'] = obj.get('size', {'width':1, 'height':1, 'depth':1})
        objects.sort(key=lambda o: o['dimensions']['height'])
        for obj in objects:
            position, rotation_dims = self._find_best_position_for_item(obj, packed_objects)
            if position and rotation_dims:
                packed_obj = {**obj, 'position': position, 'dimensions': rotation_dims}
                packed_objects.append(packed_obj)
            else:
                unpacked_objects.append(obj)
        return packed_objects, unpacked_objects

    def simulated_annealing_optimization(self, objects: List[Dict], max_iterations: int = 100, progress_callback=None) -> Tuple[List[Dict], List[Dict]]:
        current_solution_order = objects.copy()
        for obj in current_solution_order:
             if 'dimensions' not in obj or not obj['dimensions']: obj['dimensions'] = obj.get('size', {'width':1, 'height':1, 'depth':1})
        current_solution_order.sort(key=lambda o: (o['dimensions']['width'] * o['dimensions']['height'] * o['dimensions']['depth'], max(o['dimensions'].values())), reverse=True)

        current_packed, _ = self._blf_pack_with_rotation(current_solution_order)
        current_cost = self.calculate_cost(current_packed)
        
        best_solution_packed = current_packed
        best_cost = current_cost
        
        temperature = 1.0
        cooling_rate = 0.99
        
        for i in range(max_iterations):
            if progress_callback: progress_callback(i / max_iterations * 100)

            neighbor_order = current_solution_order.copy()
            if len(neighbor_order) > 1:
                idx1, idx2 = random.sample(range(len(neighbor_order)), 2)
                neighbor_order[idx1], neighbor_order[idx2] = neighbor_order[idx2], neighbor_order[idx1]

            neighbor_packed, _ = self._blf_pack_with_rotation(neighbor_order)
            neighbor_cost = self.calculate_cost(neighbor_packed)
            
            if neighbor_cost > current_cost:
                current_solution_order, current_packed, current_cost = neighbor_order, neighbor_packed, neighbor_cost
                if current_cost > best_cost: best_solution_packed, best_cost = current_packed, current_cost
            elif temperature > 0 and math.exp(((neighbor_cost[0] - current_cost[0]) * 100 + (neighbor_cost[1] - current_cost[1])) / temperature) > random.random():
                current_solution_order, current_packed, current_cost = neighbor_order, neighbor_packed, neighbor_cost
            
            temperature *= cooling_rate
        
        if progress_callback: progress_callback(100)
            
        packed_ids = {o['uuid'] for o in best_solution_packed}
        unpacked_objects = [o for o in objects if o['uuid'] not in packed_ids]

        return best_solution_packed, unpacked_objects


def pack_objects_py_impl(data: Dict) -> Dict:
    """
    Main entry point for the original Python packing implementation.
    """
    container_size = data.get('container_size') or data.get('container')
    objects = data.get('objects', []) or data.get('items', [])
    
    algorithm = BLF_SA_Algorithm(container=container_size)
    
    packed_solution, unpacked_from_sa = algorithm.simulated_annealing_optimization(objects)
    
    final_packed_solution = [obj for obj in packed_solution if not obj.get('is_obstacle')]
    _, utilization = algorithm.calculate_cost(packed_solution)
    
    return {
        "success": True,
        "packed_objects": final_packed_solution,
        "unpacked_objects": unpacked_from_sa,
        "volume_utilization": utilization,
        "message": f"成功打包 {len(final_packed_solution)}/{len(objects)} 個物件。"
    }