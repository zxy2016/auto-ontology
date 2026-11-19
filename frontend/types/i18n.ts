// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { zhCN } from '@/lib/i18n/zh-CN';

export type Locale = 'en' | 'zh-CN';
export type Message = keyof typeof zhCN;
export type Translate = (
	message: Message,
	...values: (string | number | boolean | null | undefined)[]
) => string;
