import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';

function toPublicUser(user: {
  id: number;
  username: string;
  displayName: string | null;
  role: UserRole;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? user.username,
    role: user.role,
  };
}

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    return null;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return null;
  }

  return toPublicUser(user);
}

export async function getUserById(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    return null;
  }

  return toPublicUser(user);
}

/** Step-up confirmation: verify the signed-in user's password. */
export async function verifyPasswordByUserId(userId: number, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !password) return false;
  return bcrypt.compare(password, user.passwordHash);
}
