// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { zhCN } from './zh-CN';
import type { Locale, Translate } from '@/types/i18n';

// The English message is the key. Translate complete messages and keep indexed
// placeholders so catalog entries can reorder the arguments to fit the language.
export const createTranslation =
	(locale: Locale): Translate =>
	(message, ...values) => {
		const text = locale === 'zh-CN' ? zhCN[message] : message;
		return values.length === 0
			? text
			: text.replace(/\{([1-9]\d*)\}/g, (placeholder, index) =>
					Number(index) <= values.length
						? String(values[Number(index) - 1])
						: placeholder,
				);
	};
