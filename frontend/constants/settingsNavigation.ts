// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Message } from '@/types/i18n';

export const SETTINGS_SECTIONS = [
	{ slug: 'connections', label: 'Connections' },
	{ slug: 'zones', label: 'Zones' },
	{ slug: 'tags', label: 'Tags' },
	{ slug: 'rules', label: 'Rules' },
	{ slug: 'pii', label: 'PII Settings' },
	{ slug: 'semantic-input', label: 'Semantic Input' },
	{ slug: 'users', label: 'Users' },
	{ slug: 'sso', label: 'Single Sign-On' },
	{ slug: 'semantic-compilation', label: 'Semantic Compilation' },
	{ slug: 'agent-settings', label: 'Agent Settings' },
	{ slug: 'import-export', label: 'Import / Export' },
] as const satisfies readonly { slug: string; label: Message }[];
