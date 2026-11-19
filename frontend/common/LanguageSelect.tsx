// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

'use client';

import { useState, useTransition } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { setLocale } from '@/lib/i18n/actions';
import { isLocale, LOCALES } from '@/lib/i18n/locale';

export const LanguageSelect = () => {
	const { locale, t } = useLocale();
	const [pending, startTransition] = useTransition();
	const [failed, setFailed] = useState(false);

	const changeLanguage = (value: string) => {
		if (!isLocale(value) || value === locale) return;
		setFailed(false);
		startTransition(async () => {
			try {
				await setLocale(value);
			} catch {
				setFailed(true);
			}
		});
	};

	return (
		<div className="relative">
			<select
				aria-label={t('Language')}
				value={locale}
				disabled={pending}
				onChange={(event) => changeLanguage(event.target.value)}
				className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-body focus-visible:outline-2 focus-visible:outline-[#76b900] disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
			>
				{Object.entries(LOCALES).map(([value, label]) => (
					<option key={value} lang={value} value={value}>
						{label}
					</option>
				))}
			</select>
			{failed && (
				<p
					role="alert"
					className="absolute top-full right-0 z-40 mt-1 w-max rounded-md bg-white p-2 text-xs text-red-600 shadow dark:bg-zinc-900 dark:text-red-400"
				>
					{t('Failed to change language. Please try again.')}
				</p>
			)}
		</div>
	);
};
