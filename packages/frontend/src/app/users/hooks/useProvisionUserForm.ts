'use client';

import { useState } from 'react';
import type { Role } from '@cold-storage/contracts';
import { indianMobileSchema } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import type { FacilityOption } from '@/context/FacilityContext';

interface UseProvisionUserFormProps {
  availableFacilities: FacilityOption[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function useProvisionUserForm({
  availableFacilities,
  onClose,
  onSuccess,
}: UseProvisionUserFormProps) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('OPERATOR');
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<string[]>(
    availableFacilities.length > 0 ? [availableFacilities[0].id] : [],
  );
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleFacilityToggle = (facilityId: string) => {
    setSelectedFacilityIds((prev) =>
      prev.includes(facilityId) ? prev.filter((id) => id !== facilityId) : [...prev, facilityId],
    );
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!fullName.trim()) return setCreateError('Full name is required.');
    if (!username.trim() || username.length < 3)
      return setCreateError('Username must be at least 3 characters.');
    if (!employeeId.trim()) return setCreateError('Employee ID is required.');
    if (!indianMobileSchema.safeParse(mobile.trim()).success)
      return setCreateError('Mobile must be a valid 10-digit Indian number starting with 6-9.');
    if (!email.trim() || !email.includes('@'))
      return setCreateError('A valid email address is required.');
    if (selectedFacilityIds.length === 0)
      return setCreateError('User must be assigned to at least one facility.');
    if (temporaryPassword.length < 8)
      return setCreateError('Temporary password must be at least 8 characters.');

    setCreating(true);
    try {
      const res = await requestWithAuth('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          username: username.trim(),
          employeeId: employeeId.trim(),
          mobile: mobile.trim(),
          email: email.trim(),
          role,
          facilityIds: selectedFacilityIds,
          temporaryPassword,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string; details?: unknown };
        throw new Error(err.error || `Failed to create user (HTTP ${res.status})`);
      }

      onSuccess(`User "${username}" provisioned successfully with temporary password.`);
      onClose();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'User creation failed');
    } finally {
      setCreating(false);
    }
  };

  return {
    fullName,
    setFullName,
    username,
    setUsername,
    employeeId,
    setEmployeeId,
    mobile,
    setMobile,
    email,
    setEmail,
    role,
    setRole,
    selectedFacilityIds,
    handleFacilityToggle,
    temporaryPassword,
    setTemporaryPassword,
    creating,
    createError,
    handleCreateUser,
  };
}
