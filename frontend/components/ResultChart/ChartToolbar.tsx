// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

'use client';

import { useTranslation } from '@/contexts/LocaleContext';
import type { FC } from 'react';
import { ChevronDown, ChevronUp, Download } from '@/adapters/ui/icons';
import { downloadCsv } from './export-csv';
import type { ChartSpec } from './types';

/** Per-chart actions: reveal the underlying rows, or export them as CSV. */
export const ChartToolbar: FC<{
	spec: ChartSpec;
	dataOpen: boolean;
	dataId: string;
	onToggleData: () => void;
}> = ({ spec, dataOpen, dataId, onToggleData }) => {
	const t = useTranslation();
	return (
		<div className="result-chart-toolbar">
			<button
				type="button"
				className="result-chart-tool"
				aria-expanded={dataOpen}
				aria-controls={dataOpen ? dataId : undefined}
				onClick={onToggleData}
			>
				{dataOpen ? (
					<ChevronUp className="h-3.5 w-3.5" />
				) : (
					<ChevronDown className="h-3.5 w-3.5" />
				)}
				{dataOpen ? t('Hide data') : t('Show data')}
			</button>
			<button
				type="button"
				className="result-chart-tool"
				title={t('Download the Chart Data as CSV')}
				onClick={() => downloadCsv(spec)}
			>
				<Download className="h-3.5 w-3.5" />
				CSV
			</button>
		</div>
	);
};
