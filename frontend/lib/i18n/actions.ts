// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

'use server';

import { cookies } from 'next/headers';
import { isLocale, LOCALE_COOKIE } from './locale';
import type { Locale } from '@/types/i18n';

export const setLocale = async (locale: Locale) => {
	if (!isLocale(locale)) return;
	const cookieStore = await cookies();
	cookieStore.set(LOCALE_COOKIE, locale, {
		path: '/',
		maxAge: 365 * 24 * 60 * 60,
		httpOnly: true,
		sameSite: 'lax',
	});
};
