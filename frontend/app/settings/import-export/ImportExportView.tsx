// SPDX-FileCopyrightText: Copyright (c) 2024-2026, NVIDIA CORPORATION & AFFILIATES.
// All rights reserved.
// SPDX-License-Identifier: Apache-2.0

'use client';

import type { Message } from '@/types/i18n';
import { useTranslation } from '@/contexts/LocaleContext';
import { useEffect, useState } from 'react';
import { datasources } from '@/api/datasources';
import { modelInterchangeApi } from '@/api/modelInterchange';
import { Button } from '@/common/Button';
import { FileUpload } from '@/common/FileUpload';
import { Icon, IconName } from '@/common/icons';
import { ConfirmModal } from '@/common/modal';
import { ProgressBar } from '@/common/ProgressBar';
import { SkeletonRows } from '@/common/Skeleton';
import { Toast } from '@/common/Toast';
import { Toggle } from '@/common/Toggle';
import { ButtonTheme, Size } from '@/enums/button';
import { ModelFormat } from '@/enums/modelInterchange';
import { ToastVariant } from '@/enums/toast';
import { useSmoothProgress } from '@/lib/useSmoothProgress';
import type { Database } from '@/types/datasources';
import type { ImportEntityCounts, ImportSummary } from '@/types/modelInterchange';

const FORMAT_LABEL: Record<ModelFormat, Message> = {
	[ModelFormat.AUTO_ONTOLOGY]: 'Native Auto Ontology',
	[ModelFormat.OSSIE]: 'Apache Ossie',
};

const EXPORT_FILENAME: Record<ModelFormat, string> = {
	[ModelFormat.AUTO_ONTOLOGY]: 'auto-ontology-model.yaml',
	[ModelFormat.OSSIE]: 'ossie-model.yaml',
};

// The Ossie semantic model, ontology and mapping, which are separate documents.
const OSSIE_WITH_ONTOLOGY_FILENAME = 'ossie-model.zip';

const FORMAT_OPTIONS: { value: ModelFormat; description: Message }[] = [
	{
		value: ModelFormat.AUTO_ONTOLOGY,
		description:
			'Everything Auto Ontology stores, including catalog objects Ossie cannot name.',
	},
	{
		value: ModelFormat.OSSIE,
		description: 'Open Semantic Interchange model, portable to other Ossie tools.',
	},
];

const downloadBlob = (blob: Blob, filename: string) => {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
};

const IMPORT_ENTITY_LABELS: Record<keyof ImportEntityCounts, Message> = {
	databases: 'Databases',
	schemas: 'Schemas',
	tables: 'Tables',
	columns: 'Columns',
	terms: 'Terms',
	column_attributes: 'Column Attributes',
	sql_attributes: 'SQL Attributes',
	custom_analyses: 'Custom Analyses',
};

const importEntityKeys = Object.keys(IMPORT_ENTITY_LABELS) as (keyof ImportEntityCounts)[];

const checkboxClassName = 'h-4 w-4 rounded border-zinc-300 text-[#76b900] focus:ring-[#76b900]/30';

const radioClassName = 'mt-0.5 h-4 w-4 border-zinc-300 text-[#76b900] focus:ring-[#76b900]/30';

const isYamlFile = (file: File): boolean => /\.ya?ml$/i.test(file.name);

export const ImportExportView = () => {
	const t = useTranslation();
	const [databases, setDatabases] = useState<Database[]>([]);
	const [databasesLoading, setDatabasesLoading] = useState(true);
	const [databasesError, setDatabasesError] = useState<string | null>(null);
	const [selectedDbIds, setSelectedDbIds] = useState<Set<string>>(new Set());

	const [exportFormat, setExportFormat] = useState<ModelFormat>(ModelFormat.AUTO_ONTOLOGY);
	const [includeOntology, setIncludeOntology] = useState(true);
	const [exporting, setExporting] = useState(false);
	const [exportError, setExportError] = useState<string | null>(null);
	const [exportMessage, setExportMessage] = useState<string | null>(null);
	const exportProgress = useSmoothProgress();

	const [importFile, setImportFile] = useState<File | null>(null);
	const [replace, setReplace] = useState(true);
	const [embed, setEmbed] = useState(true);
	const [confirmImportOpen, setConfirmImportOpen] = useState(false);
	const [importing, setImporting] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);
	const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

	useEffect(() => {
		let active = true;
		void (async () => {
			setDatabasesLoading(true);
			const res = await datasources.getDBs();
			if (!active) return;
			if (res.error) {
				setDatabasesError(res.message ?? '');
				setDatabases([]);
			} else {
				const data = res.data ?? [];
				setDatabasesError(null);
				setDatabases(data);
				// Default to exporting everything.
				setSelectedDbIds(new Set(data.map((db) => db.id)));
			}
			setDatabasesLoading(false);
		})();
		return () => {
			active = false;
		};
	}, []);

	const allSelected = databases.length > 0 && selectedDbIds.size === databases.length;

	const toggleDatabase = (id: string) => {
		setSelectedDbIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const toggleSelectAll = () => {
		setSelectedDbIds(allSelected ? new Set() : new Set(databases.map((db) => db.id)));
	};

	const handleExport = async () => {
		if (selectedDbIds.size === 0 || exporting) return;
		const withOntology = exportFormat === ModelFormat.OSSIE && includeOntology;
		setExporting(true);
		setExportError(null);
		// The YAML arrives in one response, so this eases toward 90% while we
		// wait, then `complete()` snaps to 100% when the file is ready.
		exportProgress.start({
			tauMs:
				2200 + selectedDbIds.size * 450 + (exportFormat === ModelFormat.OSSIE ? 1200 : 0),
		});
		try {
			const res = await modelInterchangeApi.exportModel(
				Array.from(selectedDbIds),
				exportFormat,
				withOntology,
			);
			if (res.error) {
				exportProgress.fail();
				setExportError(res.message ?? t('Failed to export model.'));
				return;
			}
			await exportProgress.complete();
			downloadBlob(
				res.blob,
				withOntology ? OSSIE_WITH_ONTOLOGY_FILENAME : EXPORT_FILENAME[exportFormat],
			);
			setExportMessage(
				withOntology
					? t(
							'Model exported as {1}, with its ontology and mapping.',
							t(FORMAT_LABEL[exportFormat]),
						)
					: t('Model exported as {1}.', t(FORMAT_LABEL[exportFormat])),
			);
		} catch {
			exportProgress.fail();
			setExportError(t('Failed to export model.'));
		} finally {
			setExporting(false);
		}
	};

	const handleImportFileChange = (file: File | null) => {
		setImportFile(file);
		setImportError(null);
		setImportSummary(null);
	};

	const handleRequestImport = () => {
		if (!importFile || importing) return;
		setImportError(null);
		setConfirmImportOpen(true);
	};

	const handleCancelImport = () => {
		if (importing) return;
		setConfirmImportOpen(false);
	};

	const handleConfirmImport = async () => {
		if (!importFile) return;
		setImporting(true);
		setImportError(null);
		const res = await modelInterchangeApi.importModel(importFile, { replace, embed });
		setImporting(false);

		if (res.error) {
			setImportError(res.message ?? t('Failed to import model.'));
			return;
		}

		setImportSummary(res.summary);
		setConfirmImportOpen(false);
		setImportFile(null);
	};

	return (
		<div className="mx-auto w-full max-w-2xl space-y-6">
			<h1 className="text-lg font-semibold text-heading dark:text-zinc-100">
				{t('Import / Export')}
			</h1>

			<section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-700">
				<h2 className="text-sm font-semibold text-heading dark:text-zinc-100">
					{t('Export Model')}
				</h2>
				<p className="mt-1 text-xs text-secondary">
					{t(
						'Download the catalog and semantic layer for the selected databases as a YAML file, or as a .zip when the Ossie ontology is included.',
					)}
				</p>

				<fieldset className="mt-4">
					<legend className="text-xs font-medium text-heading dark:text-zinc-200">
						{t('Format')}
					</legend>
					<div className="mt-2 grid gap-2 sm:grid-cols-2">
						{FORMAT_OPTIONS.map(({ value, description }) => (
							<label
								key={value}
								className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 px-3 py-2 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/80"
							>
								<input
									type="radio"
									name="export-format"
									value={value}
									checked={exportFormat === value}
									onChange={() => setExportFormat(value)}
									className={radioClassName}
								/>
								<span>
									<span className="block text-sm font-medium text-heading dark:text-zinc-100">
										{t(FORMAT_LABEL[value])}
									</span>
									<span className="block text-xs text-secondary">
										{t(description)}
									</span>
								</span>
							</label>
						))}
					</div>
				</fieldset>

				{exportFormat === ModelFormat.OSSIE ? (
					<div className="mt-3 flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-700">
						<div className="flex flex-col">
							<span className="text-sm font-medium text-heading dark:text-zinc-100">
								{t('Include Ontology and Mapping')}
							</span>
							<span className="text-xs text-secondary">
								{t(
									'Also exports the terms as an Ossie ontology, with a mapping onto the semantic model, as a .zip of three files.',
								)}
							</span>
						</div>
						<Toggle
							checked={includeOntology}
							aria-label={t('Include Ontology and Mapping')}
							onChange={setIncludeOntology}
						/>
					</div>
				) : null}

				{databasesLoading ? (
					<div className="mt-4">
						<SkeletonRows rows={3} />
					</div>
				) : databasesError !== null ? (
					<p className="mt-4 text-sm text-red-600 dark:text-red-400">
						{databasesError || t('Failed to load databases.')}
					</p>
				) : databases.length === 0 ? (
					<p className="mt-4 text-sm text-secondary">{t('No Databases Found.')}</p>
				) : (
					<div className="mt-4 space-y-2">
						<label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/80">
							<input
								type="checkbox"
								checked={allSelected}
								onChange={toggleSelectAll}
								className={checkboxClassName}
							/>
							<span className="text-sm font-medium text-heading dark:text-zinc-200">
								{allSelected ? t('Deselect all') : t('Select all')}
							</span>
						</label>
						<div className="max-h-56 overflow-y-auto rounded-md border border-zinc-100 dark:border-zinc-800">
							{databases.map((db) => (
								<label
									key={db.id}
									className="flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-3 py-2 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/80"
								>
									<input
										type="checkbox"
										checked={selectedDbIds.has(db.id)}
										onChange={() => toggleDatabase(db.id)}
										className={checkboxClassName}
									/>
									<span className="text-sm text-heading dark:text-zinc-200">
										{db.name}
									</span>
								</label>
							))}
						</div>
					</div>
				)}

				{exportError ? (
					<p className="mt-3 text-sm text-red-600 dark:text-red-400">{exportError}</p>
				) : null}

				{exporting ? (
					<ProgressBar
						value={exportProgress.value}
						showValue
						label={t('Exporting')}
						className="mt-4"
						aria-label={t(
							'Exporting model, {1} percent',
							Math.round(exportProgress.value),
						)}
					/>
				) : null}

				<div className="mt-4 flex justify-end">
					<Button
						theme={ButtonTheme.Primary}
						size={Size.REGULAR}
						type="button"
						onClick={() => {
							void handleExport();
						}}
						disabled={selectedDbIds.size === 0 || exporting || databasesLoading}
						loading={exporting}
						iconPosition="left"
					>
						<Icon name={IconName.Download} className="h-4 w-4" />
						{exporting ? t('Exporting…') : t('Export')}
					</Button>
				</div>
			</section>

			<section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-700">
				<h2 className="text-sm font-semibold text-heading dark:text-zinc-100">
					{t('Import Model')}
				</h2>
				<p className="mt-1 text-xs text-secondary">
					{t(
						'Upload a native Auto Ontology or Apache Ossie model YAML file to write it into the catalog and semantic layer. The format is detected from the file.',
					)}
				</p>

				<FileUpload
					value={importFile}
					onChange={handleImportFileChange}
					onError={setImportError}
					validate={(file) =>
						isYamlFile(file) ? null : t('Please choose a .yaml or .yml file.')
					}
					accept=".yaml,.yml"
					description={t('YAML files (.yaml, .yml)')}
					aria-label={t('Upload a Auto Ontology or Apache Ossie model YAML file')}
					className="mt-4"
				/>

				{importError && !confirmImportOpen ? (
					<p className="mt-2 text-sm text-red-600 dark:text-red-400">{importError}</p>
				) : null}

				<div className="mt-4 flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-700">
					<div className="flex flex-col">
						<span className="text-sm font-medium text-heading dark:text-zinc-100">
							{t('Replace Existing Data')}
						</span>
						<span className="text-xs text-secondary">
							{t(
								"Deletes semantic-layer data for the imported databases that isn't in this file.",
							)}
						</span>
					</div>
					<Toggle
						checked={replace}
						aria-label={t('Replace Existing Data')}
						onChange={setReplace}
					/>
				</div>

				<div className="mt-3 flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-700">
					<div className="flex flex-col">
						<span className="text-sm font-medium text-heading dark:text-zinc-100">
							{t('Regenerate Embeddings')}
						</span>
						<span className="text-xs text-secondary">
							{t(
								'Embeds newly created nodes and pushes them into the vector databases.',
							)}
						</span>
					</div>
					<Toggle
						checked={embed}
						aria-label={t('Regenerate Embeddings')}
						onChange={setEmbed}
					/>
				</div>

				{importSummary ? (
					<div className="mt-3 rounded-lg border border-[#76b900]/30 bg-[#76b900]/5 p-3 text-xs text-body dark:text-zinc-300">
						<p className="font-medium text-heading dark:text-zinc-100">
							{t('Import Summary')}
						</p>
						<ul className="mt-1.5 space-y-0.5">
							<li>{t('Read as: {1}', t(FORMAT_LABEL[importSummary.format]))}</li>
							{importEntityKeys
								.filter((key) => importSummary.created[key] > 0)
								.map((key) => (
									<li key={key}>
										{t(
											'Created {1}: {2}',
											t(IMPORT_ENTITY_LABELS[key]),
											importSummary.created[key],
										)}
									</li>
								))}
							{importSummary.embeddings ? (
								<li>
									{importSummary.embeddings.skipped
										? t('Embeddings skipped (embed API key not configured).')
										: t(
												'Embedded {1} data row(s) and {2} semantic row(s).',
												importSummary.embeddings.data_rows,
												importSummary.embeddings.semantic_rows,
											)}
								</li>
							) : null}
						</ul>
					</div>
				) : null}

				<div className="mt-4 flex justify-end">
					<Button
						theme={ButtonTheme.Primary}
						size={Size.REGULAR}
						type="button"
						onClick={handleRequestImport}
						disabled={!importFile || importing}
						iconPosition="left"
					>
						<Icon name={IconName.Upload} className="h-4 w-4" />
						{t('Import')}
					</Button>
				</div>
			</section>

			<ConfirmModal
				open={confirmImportOpen}
				title={t('Import Model')}
				message={
					<>
						{t(
							'This writes {1} into the catalog and semantic layer.',
							importFile?.name ?? '',
						)}
						{replace ? (
							<span className="mt-2 block">
								{t(
									"“Replace Existing Data” is on. Semantic-layer data for the imported databases that isn't in this file will be deleted. This action cannot be undone.",
								)}
							</span>
						) : null}
					</>
				}
				confirmLabel={t('Import')}
				tone="danger"
				onConfirm={handleConfirmImport}
				onCancel={handleCancelImport}
				confirming={importing}
				error={importError}
			/>

			<Toast
				open={exportMessage !== null}
				message={exportMessage ?? ''}
				variant={ToastVariant.Success}
				onClose={() => setExportMessage(null)}
			/>
		</div>
	);
};
