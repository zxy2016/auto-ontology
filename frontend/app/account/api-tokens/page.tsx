// SPDX-FileCopyrightText: Copyright (c) 2024-2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { translatedMetadata } from '@/lib/i18n/server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/auth/auth-guards';
import { userCan } from '@/auth/permissions';
import { ApiTokensView } from '@/components/apiTokensPage/ApiTokensView';

export const generateMetadata = () => translatedMetadata('API Tokens');

export default async function ApiTokensPage() {
	const session = await requireUser();
	const allowed = userCan(
		{ id: session.user.id, role: session.user.role ?? null },
		{ apiToken: ['manage'] },
	);
	if (!allowed) redirect('/chat');
	return <ApiTokensView />;
}
