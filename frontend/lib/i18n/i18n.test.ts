// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { resolveLocale } from './locale';
import { createTranslation } from './translate';
import { zhCN } from './zh-CN';

describe('locale selection', () => {
	it('prefers a valid explicit selection over the browser language', () => {
		expect(resolveLocale('en', 'zh-CN,zh;q=0.9,en;q=0.7')).toBe('en');
		expect(resolveLocale('zh-CN', 'en')).toBe('zh-CN');
	});

	it('honors language priorities and falls back to English', () => {
		expect(resolveLocale(undefined, 'fr-CA,zh;q=0.8,en;q=0.9')).toBe('en');
		expect(resolveLocale('invalid', 'en;q=0.2,ZH-Hans-SG;q=0.9')).toBe('zh-CN');
		expect(resolveLocale(undefined, 'zh;q=0,en;q=0.9')).toBe('en');
		expect(resolveLocale(undefined, 'de')).toBe('en');
		expect(resolveLocale()).toBe('en');
	});
});

describe('messages', () => {
	it('uses the English text as the fallback and preserves interpolated values', () => {
		expect(createTranslation('en')('Close {1}', 'Order {2}')).toBe('Close Order {2}');
		expect(createTranslation('zh-CN')('Close {1}', 'Order {2}')).toBe('关闭 Order {2}');
	});

	it('has a translation with matching placeholders for every message', () => {
		for (const [english, chinese] of Object.entries(zhCN)) {
			expect(chinese.trim(), english).not.toBe('');
			const slots = (message: string) => [...new Set(message.match(/\{\d+\}/g) ?? [])].sort();
			expect(slots(chinese), english).toEqual(slots(english));
		}
	});
});
