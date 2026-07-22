
import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { ActivityType, ActivityTypeGroup } from '../types';

interface Props {
  type: ActivityType;
  groups: ActivityTypeGroup[];
  onSave: (updatedType: ActivityType) => void;
  onDelete: (typeId: number) => void;
  onClose: () => void;
}

export default function EditTypeForm({ type, groups, onSave, onDelete, onClose }: Props) {
  const [label, setLabel] = useState(type.label);
  const [emoji, setEmoji] = useState(type.emoji);
  const [color, setColor] = useState(type.color);
  const [groupId, setGroupId] = useState(type.group_id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.patch<ActivityType>(`/activity-types/${type.id}`, {
        label: label || undefined,
        emoji: emoji || undefined,
        color: color || undefined,
        group_id: groupId,
      });
      onSave(updated);
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this status? This cannot be undone.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.del(`/activity-types/${type.id}`);
      onDelete(type.id);
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="row wrap">
        <input
          placeholder="What are you doing?"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <input
          placeholder="-️"
          value={emoji || ''}
          onChange={(e) => setEmoji(e.target.value)}
          style={{ width: 70 }}
        />
        <input
          type="color"
          value={color || '#ffffff'}
          onChange={(e) => setColor(e.target.value)}
          style={{ width: 56 }}
        />
      </div>
      <label>
        <span>Group (optional)</span>
        <select value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— None —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.emoji || ''} {g.name}
              {g.owner_id != null ? ' (yours)' : ''}
            </option>
          ))}
        </select>
      </label>
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
