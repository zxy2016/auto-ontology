// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTranslation } from '@/lib/i18n/translate';
import type { Locale, Translate } from '@/types/i18n';

const LocaleContext = createContext({ locale: 'en' as Locale, t: createTranslation('en') });

export const LocaleProvider = ({ children, locale }: { children: ReactNode; locale: Locale }) => {
	const value = useMemo(() => ({ locale, t: createTranslation(locale) }), [locale]);
	return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export const useLocale = () => useContext(LocaleContext);

export const useTranslation = (): Translate => useLocale().t;
