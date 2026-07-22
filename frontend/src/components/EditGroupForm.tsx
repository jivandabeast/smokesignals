
import React, { useState } from 'react';
import { api } from '../api';
import type { ActivityTypeGroup } from '../types';

interface Props {
  group: ActivityTypeGroup;
  onSave: (updatedGroup: ActivityTypeGroup) => void;
  onDelete: (groupId: number) => void;
  onClose: () => void;
}

export default function EditGroupForm({ group, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.patch<ActivityTypeGroup>(`/activity-types/groups/${group.id}`, {
        name: name || undefined,
        emoji: emoji || undefined,
      });
      onSave(updated);
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this group? This will not delete the statuses inside, but they will become ungrouped.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.del(`/activity-types/groups/${group.id}`);
      onDelete(group.id);
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="row wrap">
        <input
          placeholder="Group name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <input
          placeholder="-️"
          value={emoji || ''}
          onChange={(e) => setEmoji(e.target.value)}
          style={{ width: 70 }}
        />
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row space">
        <button className="danger" onClick={handleDelete} disabled={busy}>
          Delete
        </button>
        <div className="row">
          <button className="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
