'use client';

import DataEditor, {
  CompactSelection,
  GridCellKind,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { useCallback, useMemo, useState } from 'react';

import type { PomadeColumn, PomadeRow } from '@/lib/pomade-types';

type Props = {
  columns: PomadeColumn[];
  rows: PomadeRow[];
  onRowsChange: (rows: PomadeRow[]) => void;
  onActiveRowChange: (rowId: string) => void;
  onSelectedRowIdsChange: (rowIds: string[]) => void;
};

function emptySelection(): GridSelection {
  return {
    rows: CompactSelection.empty(),
    columns: CompactSelection.empty(),
  };
}

export default function PomadeDataGrid({
  columns,
  rows,
  onRowsChange,
  onActiveRowChange,
  onSelectedRowIdsChange,
}: Props) {
  const [gridSelection, setGridSelection] = useState<GridSelection>(() =>
    emptySelection(),
  );

  const gridColumns = useMemo<GridColumn[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        title:
          column.kind === 'formula'
            ? `ƒ  ${column.title}`
            : column.kind === 'enrichment'
              ? `✦  ${column.title}`
              : column.title,
        width: column.width,
      })),
    [columns],
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const column = columns[col];
      const value = rows[row]?.values[column.id] ?? '';
      const isStatus = column.kind === 'status';
      const isGenerated =
        column.kind === 'formula' || column.kind === 'enrichment';

      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: !isStatus,
        readonly: isStatus,
        contentAlign: column.recipe === 'score-fit' ? 'center' : 'left',
        themeOverride: isStatus
          ? {
              textDark: value === 'Ready' ? '#17613c' : '#8a5a12',
              bgCell: value === 'Ready' ? '#effbf2' : '#fff9e9',
              fontFamily: 'var(--font-geist-sans)',
            }
          : isGenerated
            ? { bgCell: '#fbfff3' }
            : undefined,
      };
    },
    [columns, rows],
  );

  const onCellEdited = useCallback(
    ([col, row]: Item, value: EditableGridCell) => {
      const column = columns[col];
      if (value.kind !== GridCellKind.Text || column.kind === 'status') return;
      onRowsChange(
        rows.map((item, index) =>
          index === row
            ? { ...item, values: { ...item.values, [column.id]: value.data } }
            : item,
        ),
      );
    },
    [columns, onRowsChange, rows],
  );

  const onGridSelectionChange = useCallback(
    (selection: GridSelection) => {
      setGridSelection(selection);
      const selectedIds = selection.rows
        .toArray()
        .map((index) => rows[index]?.id)
        .filter((rowId): rowId is string => Boolean(rowId));
      onSelectedRowIdsChange(selectedIds);
      if (selectedIds.length === 1) onActiveRowChange(selectedIds[0]);
    },
    [onActiveRowChange, onSelectedRowIdsChange, rows],
  );

  return (
    <DataEditor
      columns={gridColumns}
      rows={rows.length}
      getCellContent={getCellContent}
      onCellEdited={onCellEdited}
      onCellClicked={([, row]) => onActiveRowChange(rows[row].id)}
      gridSelection={gridSelection}
      onGridSelectionChange={onGridSelectionChange}
      getCellsForSelection
      onPaste
      rowMarkers={{ kind: 'both', width: 52 }}
      rowSelect="multi"
      rowSelectionMode="multi"
      freezeColumns={1}
      smoothScrollX
      smoothScrollY
      fillHandle
      height="100%"
      width="100%"
      headerHeight={42}
      rowHeight={44}
      theme={{
        accentColor: '#2f5f48',
        accentFg: '#ffffff',
        accentLight: '#dff5ce',
        bgCell: '#ffffff',
        bgCellMedium: '#f7f7f3',
        bgHeader: '#f6f5f0',
        bgHeaderHovered: '#eeede6',
        bgHeaderHasFocus: '#e8f1e4',
        borderColor: '#e3e1d8',
        horizontalBorderColor: '#ebe9e1',
        textDark: '#1d2a24',
        textMedium: '#4e5d55',
        textLight: '#7c8982',
        fontFamily: 'var(--font-geist-sans)',
        baseFontStyle: '14px',
        headerFontStyle: '600 13px',
      }}
    />
  );
}
