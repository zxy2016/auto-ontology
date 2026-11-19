// SPDX-FileCopyrightText: Copyright (c) 2024-2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { SETTINGS_SECTIONS } from '@/constants/settingsNavigation';
import { useTranslation } from '@/contexts/LocaleContext';

function rowClassName(selected: boolean) {
	return `flex min-h-9 items-center rounded-lg px-3 text-sm no-underline transition-colors ${
		selected
			? 'bg-[#76b900]/15 font-medium text-heading shadow-sm ring-1 ring-[#76b900]/30 dark:text-zinc-100'
			: 'text-heading hover:bg-zinc-100/90 dark:text-zinc-200 dark:hover:bg-zinc-800/70'
	}`;
}

export type SettingsNavProps = {
	/**
	 * Connections come from the CONNECTION_STRINGS env var, so they are fixed by
	 * config and the section is dropped. Resolved by the server layout rather
	 * than fetched here: a client-side lookup rendered the link for as long as
	 * the request took, then took it away again.
	 */
	connectionsEnvManaged: boolean;
};

// The whole Settings section is admin-only (gated in app/settings/layout.tsx),
// so no per-item role checks are needed here.
export const SettingsNav = ({ connectionsEnvManaged }: SettingsNavProps) => {
	const pathname = usePathname();
	const t = useTranslation();

	const items = SETTINGS_SECTIONS.filter(
		({ slug }) => !connectionsEnvManaged || slug !== 'connections',
	);

	return (
		<nav
			className="flex min-h-0 flex-1 flex-col gap-y-1 overflow-y-auto px-3 py-2 sm:px-4"
			aria-label={t('Settings sections')}
		>
			{items.map((item) => {
				const href = `/settings/${item.slug}`;
				const selected = pathname === href || pathname.startsWith(`${href}/`);
				return (
					<Link
						key={href}
						href={href}
						aria-current={selected ? 'page' : undefined}
						className={rowClassName(selected)}
					>
						{t(item.label)}
					</Link>
				);
			})}
		</nav>
	);
};
