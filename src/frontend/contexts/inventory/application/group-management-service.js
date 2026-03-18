import { buildCreateGroupDraft, buildGroupUpdateDraft } from '../domain/group-drafts.js';
import { groupsApi } from '../infrastructure/groups-api.js';

export const groupManagementService = {
  loadGroups() {
    return groupsApi.list();
  },

  createGroup(name) {
    const payload = buildCreateGroupDraft(name);
    if (!payload.name) {
      throw new Error('Group name is required');
    }

    return groupsApi.create(payload);
  },

  deleteGroup(groupId) {
    return groupsApi.remove(groupId);
  },

  renameGroup(currentGroup, newName) {
    if (!currentGroup) {
      throw new Error('Current group is required');
    }

    return groupsApi.update(
      currentGroup.id,
      buildGroupUpdateDraft({ currentGroup, name: newName })
    );
  },

  saveGroupNote(currentGroup, newNote) {
    if (!currentGroup) {
      throw new Error('Current group is required');
    }

    return groupsApi.update(
      currentGroup.id,
      buildGroupUpdateDraft({ currentGroup, note: newNote })
    );
  }
};
