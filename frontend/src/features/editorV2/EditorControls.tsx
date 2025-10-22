import React from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { PlanType, RoleType } from '../../types/blocks';

const getPlanBadgeColor = (plan: PlanType) => {
  switch (plan) {
    case 'free': return '#6b7280';
    case 'pro': return '#3b82f6';
    case 'enterprise': return '#8b5cf6';
  }
};

const EditorControls: React.FC = () => {
  const { plan, role, setPlan, setRole, searchQuery, setSearchQuery, catalog } = useEditorStore();

  const handlePlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPlan(e.target.value as PlanType);
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRole(e.target.value as RoleType);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '12px 16px',
      backgroundColor: '#0f1729',
      borderBottom: '1px solid #1f2937',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ color: '#9ca3af', fontSize: 12, fontWeight: 500 }}>
          Тариф:
        </label>
        <select
          value={plan}
          onChange={handlePlanChange}
          style={{
            background: '#1a1a2e',
            color: '#fff',
            border: '1px solid #374151',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ color: '#9ca3af', fontSize: 12, fontWeight: 500 }}>
          Роль:
        </label>
        <select
          value={role}
          onChange={handleRoleChange}
          style={{
            background: '#1a1a2e',
            color: '#fff',
            border: '1px solid #374151',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <option value="viewer">Viewer</option>
          <option value="support">Support</option>
          <option value="developer">Developer</option>
          <option value="manager_template">Manager Template</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        <label style={{ color: '#9ca3af', fontSize: 12, fontWeight: 500 }}>
          Поиск:
        </label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Найти блок..."
          style={{
            background: '#1a1a2e',
            color: '#fff',
            border: '1px solid #374151',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            flex: 1,
            maxWidth: 300,
          }}
        />
      </div>

      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 12,
        marginLeft: 'auto' 
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: 'rgba(59, 130, 246, 0.1)',
          borderRadius: 6,
          border: '1px solid rgba(59, 130, 246, 0.3)',
        }}>
          <span style={{ fontSize: 20 }}>👤</span>
          <div style={{ fontSize: 12 }}>
            <div style={{ 
              fontWeight: 700, 
              color: getPlanBadgeColor(plan),
              textTransform: 'uppercase'
            }}>
              {plan}
            </div>
            <div style={{ opacity: 0.7, fontSize: 10, color: '#9ca3af' }}>
              {role}
            </div>
          </div>
        </div>
        <div style={{ color: '#6b7280', fontSize: 12 }}>
          Блоков: {catalog.length}
        </div>
      </div>
    </div>
  );
};

export default EditorControls;

