// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server';
import { withPermission } from '@/auth/with-auth';
import { readSemanticOutputLanguage, SEMANTIC_OUTPUT_LANGUAGE_KEY } from '@/lib/configurations';
import { getPrisma } from '@/lib/prisma';
import { semanticOutputLanguageBody } from './openapi';

export const GET = withPermission({ semanticCompilation: ['read'] })(async () => {
	return NextResponse.json({ language: await readSemanticOutputLanguage() });
});

export const PUT = withPermission({ semanticCompilation: ['manage'] })(async (req) => {
	const raw: unknown = await req.json().catch(() => null);
	const parsed = semanticOutputLanguageBody.safeParse(raw);
	if (!parsed.success) {
		return NextResponse.json({ error: 'Specify language as en or zh-CN.' }, { status: 400 });
	}

	const { language } = parsed.data;
	await getPrisma().configuration.upsert({
		where: { key: SEMANTIC_OUTPUT_LANGUAGE_KEY },
		create: { key: SEMANTIC_OUTPUT_LANGUAGE_KEY, value: language },
		update: { value: language },
	});
	return NextResponse.json({ language });
});
