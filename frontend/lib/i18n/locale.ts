// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Locale } from '@/types/i18n';

export const LOCALES = {
	en: 'English',
	'zh-CN': '简体中文',
} as const satisfies Record<Locale, string>;

export const LOCALE_COOKIE = 'auto-ontology-locale';

export const isLocale = (value: unknown): value is Locale => value === 'en' || value === 'zh-CN';

export const resolveLocale = (preference?: string, acceptLanguage?: string | null): Locale => {
	if (isLocale(preference)) return preference;

	const languages = (acceptLanguage ?? '')
		.split(',')
		.map((entry) => {
			const [tag, weight] = entry.trim().toLowerCase().split(';');
			const quality = weight == null ? 1 : Number(weight.trim().replace(/^q=/, ''));
			return { language: tag.split('-')[0], quality };
		})
		.filter(({ quality }) => quality > 0 && quality <= 1)
		.sort((a, b) => b.quality - a.quality);

	for (const { language } of languages) {
		if (language === 'zh') return 'zh-CN';
		if (language === 'en') return 'en';
	}
	return 'en';
};
