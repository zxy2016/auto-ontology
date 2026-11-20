// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { OpenApiRoute } from '@/types/openapi';

export const semanticOutputLanguageBody = z.object({ language: z.enum(['en', 'zh-CN']) });

export const openapi: OpenApiRoute = {
	get: {
		responses: {
			200: {
				description:
					'The instance-wide language for generated semantic text. Defaults to English.',
				schema: semanticOutputLanguageBody,
			},
		},
	},
	put: {
		body: { schema: semanticOutputLanguageBody },
		responses: {
			200: {
				description:
					'The stored language for future compilation runs. Saving does not trigger a run.',
				schema: semanticOutputLanguageBody,
			},
			400: { description: 'Body is not JSON, or the language is unsupported.' },
		},
	},
};
