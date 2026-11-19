// SPDX-FileCopyrightText: Copyright (c) 2024-2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

'use client';

import { useTranslation } from '@/contexts/LocaleContext';
import { Button } from '@/common/Button';
import { Size, ButtonTheme } from '@/enums/button';
import { Icon, IconName } from '@/common/icons';
import { ExplorationLayer } from '@/enums/exploration';

type ViewToggleProps = {
	layer: ExplorationLayer;
	onToggle: () => void;
};

export const ViewToggle = ({ layer, onToggle }: ViewToggleProps) => {
	const t = useTranslation();
	const isSemantic = layer === ExplorationLayer.Semantic;

	return (
		<Button
			theme={ButtonTheme.Primary}
			size={Size.LARGE}
			type="button"
			onClick={onToggle}
			iconPosition="left"
			shadow
		>
			<Icon name={isSemantic ? IconName.Database : IconName.Terms} className="h-4 w-4" />
			{t('Switch to {1}', isSemantic ? t('Data Objects') : t('Semantic Objects'))}
		</Button>
	);
};
