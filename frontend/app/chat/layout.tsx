// SPDX-FileCopyrightText: Copyright (c) 2024-2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { translatedMetadata } from '@/lib/i18n/server';
import { requireUser } from '@/auth/auth-guards';

export const generateMetadata = () => translatedMetadata('Chat');

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
	// Redirect to /login when there's no valid session (e.g. an expired or
	// rotated-secret cookie) instead of rendering the chat shell unauthenticated.
	await requireUser();
	return children;
}
