import copy
from typing import List, Optional
from ..types import Box3, BSPNode
from ..utils import get_box_dims, get_longest_axis, box3

class BSPTree:
    def __init__(self, warehouse_bounds: Box3):
        self.nodes_map: dict[str, BSPNode] = {}
        self.root = self._create_node(warehouse_bounds)

    def _create_node(self, bounds: Box3, partition_id: Optional[str] = None) -> BSPNode:
        node_id = f"bsp_{len(self.nodes_map)}"
        node = BSPNode(id=node_id, bounds=bounds, partition_id=partition_id)
        self.nodes_map[node_id] = node
        return node

    def _find_target_leaf(self, target_volume: float, node: BSPNode) -> Optional[BSPNode]:
        if node.left or node.right:
            left_result = self._find_target_leaf(target_volume, node.left)
            if left_result:
                return left_result
            return self._find_target_leaf(target_volume, node.right)
        
        dims = get_box_dims(node.bounds)
        node_volume = dims.x * dims.y * dims.z
        if not node.partition_id and node_volume >= target_volume:
            return node
        
        return None

    def split_node(self, target_volume: float, new_partition_id: str) -> Optional[BSPNode]:
        leaf = self._find_target_leaf(target_volume, self.root)
        if not leaf:
            return None

        leaf_dims = get_box_dims(leaf.bounds)
        leaf_volume = leaf_dims.x * leaf_dims.y * leaf_dims.z

        if leaf_volume < target_volume:
            return None # Not enough space to begin with

        best_split = {
            'axis': None,
            'split_value': 0.0,
            'cost': float('inf')
        }

        # Simulate splitting along each axis and find the one with the best score (lowest remaining surface area)
        for axis in ['x', 'y', 'z']:
            axis_length = getattr(leaf_dims, axis)
            if axis_length == 0: continue

            # Calculate the split position to achieve the target volume
            split_ratio = target_volume / leaf_volume
            split_value = getattr(leaf.bounds.min, axis) + axis_length * split_ratio

            # Create the bounds for the remaining space after the cut
            remaining_bounds = copy.deepcopy(leaf.bounds)
            setattr(remaining_bounds.min, axis, split_value)
            
            # Calculate the surface area of the remaining space as a cost function
            rem_dims = get_box_dims(remaining_bounds)
            surface_area = 2 * (rem_dims.x * rem_dims.y + rem_dims.x * rem_dims.z + rem_dims.y * rem_dims.z)

            if surface_area < best_split['cost']:
                best_split['axis'] = axis
                best_split['split_value'] = split_value
                best_split['cost'] = surface_area

        # If no valid split was found, something went wrong
        if best_split['axis'] is None:
            return None

        # --- Execute the best split ---
        final_axis = best_split['axis']
        final_split_value = best_split['split_value']

        left_bounds = copy.deepcopy(leaf.bounds)
        setattr(left_bounds.max, final_axis, final_split_value)

        right_bounds = copy.deepcopy(leaf.bounds)
        setattr(right_bounds.min, final_axis, final_split_value)

        # Create the new partition node and the remaining free space node
        partition_node = self._create_node(left_bounds, new_partition_id)
        free_space_node = self._create_node(right_bounds)

        # Update the original leaf to be an internal node
        leaf.axis = final_axis
        leaf.split_value = final_split_value
        leaf.left = partition_node
        leaf.right = free_space_node
        leaf.partition_id = None

        return partition_node

    def split_by_thickness(self, leaf: BSPNode, axis: str, thickness: float) -> tuple[Optional[BSPNode], Optional[BSPNode]]:
        """Splits a leaf node by a specific thickness along a given axis."""
        if thickness <= 0:
            return None, leaf

        leaf_dims = get_box_dims(leaf.bounds)
        axis_length = getattr(leaf_dims, axis)
        if axis_length <= thickness:
            # Not enough space, so the whole leaf is the allocation, no residual.
            return leaf, None

        split_value = getattr(leaf.bounds.min, axis) + thickness

        allocated_bounds = copy.deepcopy(leaf.bounds)
        setattr(allocated_bounds.max, axis, split_value)

        residual_bounds = copy.deepcopy(leaf.bounds)
        setattr(residual_bounds.min, axis, split_value)

        allocated_node = self._create_node(allocated_bounds)
        residual_node = self._create_node(residual_bounds)

        # Convert original leaf to an internal node
        leaf.axis = axis
        leaf.split_value = split_value
        leaf.left = allocated_node
        leaf.right = residual_node
        leaf.partition_id = None

        return allocated_node, residual_node

    def split_by_volume(self, leaf: BSPNode, target_volume: float, prefer_axis: str = 'z') -> tuple[Optional[BSPNode], list[BSPNode]]:
        """Splits a given leaf node to achieve a target volume, returning the allocated node and the residual node(s)."""
        leaf_dims = get_box_dims(leaf.bounds)
        leaf_volume = leaf_dims.x * leaf_dims.y * leaf_dims.z

        if leaf_volume < target_volume:
            return None, []

        # Use the preferred axis, but fall back if it has no length
        split_axis = prefer_axis
        if getattr(leaf_dims, split_axis) == 0:
            split_axis = get_longest_axis(leaf_dims)

        axis_length = getattr(leaf_dims, split_axis)
        if axis_length == 0: # Cannot split a 2D plane
            return None, []

        # Calculate split position
        split_ratio = target_volume / leaf_volume
        split_value = getattr(leaf.bounds.min, split_axis) + axis_length * split_ratio

        # Create bounds for the two new nodes
        allocated_bounds = copy.deepcopy(leaf.bounds)
        setattr(allocated_bounds.max, split_axis, split_value)

        residual_bounds = copy.deepcopy(leaf.bounds)
        setattr(residual_bounds.min, split_axis, split_value)

        # Safety check for near-zero volume residuals
        if get_box_dims(residual_bounds).x < 1e-6 or get_box_dims(residual_bounds).y < 1e-6 or get_box_dims(residual_bounds).z < 1e-6:
            # If residual is tiny, just give the whole leaf
            return leaf, []

        # Create the new nodes
        allocated_node = self._create_node(allocated_bounds)
        residual_node = self._create_node(residual_bounds)

        # Update the original leaf to be an internal node
        leaf.axis = split_axis
        leaf.split_value = split_value
        leaf.left = allocated_node
        leaf.right = residual_node
        leaf.partition_id = None # No longer a partition itself

        return allocated_node, [residual_node]

    def find_parent_node(self, child_node: BSPNode, current_node: Optional[BSPNode] = None) -> Optional[BSPNode]:
        if current_node is None:
            current_node = self.root

        if not current_node.left and not current_node.right:
            return None

        if current_node.left == child_node or current_node.right == child_node:
            return current_node

        found_in_left = self.find_parent_node(child_node, current_node.left) if current_node.left else None
        if found_in_left:
            return found_in_left

        found_in_right = self.find_parent_node(child_node, current_node.right) if current_node.right else None
        if found_in_right:
            return found_in_right

        return None

    def update_split(self, parent_node: BSPNode, new_split_value: float):
        if not parent_node.left or not parent_node.right or not parent_node.axis:
            print("[BSPTree] ERROR: Cannot update split on a leaf node or node without an axis.")
            return

        axis = parent_node.axis
        clamped_split_value = max(getattr(parent_node.bounds.min, axis), min(getattr(parent_node.bounds.max, axis), new_split_value))

        parent_node.split_value = clamped_split_value
        setattr(parent_node.left.bounds.max, axis, clamped_split_value)
        setattr(parent_node.right.bounds.min, axis, clamped_split_value)

    def get_leaves(self, node: Optional[BSPNode] = None) -> List[BSPNode]:
        if node is None:
            node = self.root
            
        if not node.left and not node.right:
            return [node]
        
        leaves: List[BSPNode] = []
        if node.left:
            leaves.extend(self.get_leaves(node.left))
        if node.right:
            leaves.extend(self.get_leaves(node.right))
        return leaves
