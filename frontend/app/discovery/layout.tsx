// SPDX-FileCopyrightText: Copyright (c) 2024-2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { translatedMetadata } from '@/lib/i18n/server';
import { requireUser } from '@/auth/auth-guards';

export const generateMetadata = () => translatedMetadata('Discovery');

export default async function DiscoveryLayout({ children }: { children: React.ReactNode }) {
	await requireUser();
	return children;
}
