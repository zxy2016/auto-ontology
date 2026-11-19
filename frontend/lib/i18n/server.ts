// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { LOCALE_COOKIE, resolveLocale } from './locale';
import { createTranslation } from './translate';
import type { Message } from '@/types/i18n';

export const getLocale = cache(async () => {
	const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
	return resolveLocale(
		cookieStore.get(LOCALE_COOKIE)?.value,
		requestHeaders.get('accept-language'),
	);
});

export const getServerTranslation = cache(async () => createTranslation(await getLocale()));

export const translatedMetadata = async (title: Message): Promise<Metadata> => {
	const t = await getServerTranslation();
	return { title: t(title) };
};
