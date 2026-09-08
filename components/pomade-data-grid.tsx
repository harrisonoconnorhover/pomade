'use client';

import DataEditor, {
  CompactSelection,
  GridCellKind,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ContextMenu } from '@base-ui/react/context-menu';
import { Plus, Settings2, Sparkles } from 'lucide-react';

import type { PomadeColumn, PomadeRow } from '@/lib/pomade-types';

type Props = {
  columns: PomadeColumn[];
  rows: PomadeRow[];
  readOnly?: boolean;
  compact?: boolean;
  jumpToColumn?: { id: string; revision: number };
  jumpToRow?: { id: string; revision: number };
  onRowJumped: () => void;
  onColumnJumped: () => void;
  onColumnResize: (columnId: string, width: number) => void;
  onColumnsReorder: (startIndex: number, endIndex: number) => void;
  onColumnMenu: (columnId: string) => void;
  onAddColumn: () => void;
  onRowsChange: (rows: PomadeRow[], editedColumnId?: string) => void;
  onActiveRowChange: (rowId: string) => void;
  onSelectedRowIdsChange: (rowIds: string[]) => void;
};

function emptySelection(): GridSelection {
  return {
    rows: CompactSelection.empty(),
    columns: CompactSelection.empty(),
  };
}

function subscribeToPhoneGrid(onChange: () => void) {
  const media = window.matchMedia('(max-width: 500px)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
const phoneGridSnapshot = () => window.matchMedia('(max-width: 500px)').matches;
const desktopGridSnapshot = () => false;

export default function PomadeDataGrid({
  columns,
  rows,
  readOnly = false,
  compact = false,
  jumpToColumn,
  jumpToRow,
  onRowJumped,
  onColumnJumped,
  onColumnResize,
  onColumnsReorder,
  onColumnMenu,
  onAddColumn,
  onRowsChange,
  onActiveRowChange,
  onSelectedRowIdsChange,
}: Props) {
  const phoneGrid = useSyncExternalStore(
    subscribeToPhoneGrid,
    phoneGridSnapshot,
    desktopGridSnapshot,
  );
  const [fontFamily] = useState(() =>
    typeof document === 'undefined'
      ? 'Arial, sans-serif'
      : getComputedStyle(document.body).fontFamily,
  );
  const gridRef = useRef<DataEditorRef>(null);
  const [gridReady, setGridReady] = useState(false);
  const previousColumns = useRef(new Set(columns.map((column) => column.id)));
  const openedDialog = useRef(false);
  useEffect(() => {
    const addedIndex = columns.findIndex(
      (column) => !previousColumns.current.has(column.id),
    );
    previousColumns.current = new Set(columns.map((column) => column.id));
    if (addedIndex >= 0) gridRef.current?.scrollTo(addedIndex, 0, 'horizontal');
  }, [columns]);
  useEffect(() => {
    if (!jumpToColumn) return;
    const index = columns.findIndex((column) => column.id === jumpToColumn.id);
    if (index < 0) return;
    const frame = requestAnimationFrame(() => {
      gridRef.current?.scrollTo(index, 0, 'horizontal');
      onColumnJumped();
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpToColumn, columns, onColumnJumped]);
  const [contextColumn, setContextColumn] = useState<string>();
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
              : column.valueType === 'number'
                ? `#  ${column.title}`
                : column.valueType === 'boolean'
                  ? `✓  ${column.title}`
                  : column.valueType === 'date'
                    ? `◷  ${column.title}`
                    : column.title,
        width: column.width,
        hasMenu: !readOnly,
      })),
    [columns, readOnly],
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const column = columns[col];
      if (!column)
        return {
          kind: GridCellKind.Text,
          data: '',
          displayData: '',
          readonly: true,
          allowOverlay: false,
        };
      const value = rows[row]?.values[column.id] ?? '';
      const isStatus = column.kind === 'status';
      const isGenerated =
        column.kind === 'formula' || column.kind === 'enrichment';

      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: !isStatus,
        readonly: isStatus || readOnly,
        contentAlign: column.recipe === 'score-fit' ? 'center' : 'left',
        themeOverride: isStatus
          ? {
              textDark:
                value === 'Ready'
                  ? '#17613c'
                  : value === 'Review'
                    ? '#885b19'
                    : '#65716c',
              bgCell:
                value === 'Ready'
                  ? '#eff8f2'
                  : value === 'Review'
                    ? '#fff8e8'
                    : '#f7f9f8',
            }
          : isGenerated
            ? { bgCell: '#f8fcf8' }
            : undefined,
      };
    },
    [columns, readOnly, rows],
  );

  const onCellEdited = useCallback(
    ([col, row]: Item, value: EditableGridCell) => {
      const column = columns[col];
      if (
        readOnly ||
        !column ||
        !rows[row] ||
        value.kind !== GridCellKind.Text ||
        column.kind === 'status'
      )
        return;
      const changedRow = rows[row];
      onRowsChange(
        [
          {
            ...changedRow,
            values: { ...changedRow.values, [column.id]: value.data },
          },
        ],
        column.id,
      );
    },
    [columns, onRowsChange, readOnly, rows],
  );

  const onGridSelectionChange = useCallback(
    (selection: GridSelection) => {
      setGridSelection(selection);
      const selectedIds = selection.rows
        .toArray()
        .map((index) => rows[index]?.id)
        .filter((rowId): rowId is string => Boolean(rowId));
      onSelectedRowIdsChange(selectedIds);
      const cellRow = selection.current
        ? rows[selection.current.cell[1]]
        : undefined;
      if (cellRow) onActiveRowChange(cellRow.id);
      else if (selectedIds.length === 1) onActiveRowChange(selectedIds[0]);
    },
    [onActiveRowChange, onSelectedRowIdsChange, rows],
  );

  useEffect(() => {
    if (!jumpToRow || !columns.length || !gridReady) return;
    const index = rows.findIndex((row) => row.id === jumpToRow.id);
    if (index < 0) return;
    const frame = requestAnimationFrame(() => {
      gridRef.current?.scrollTo(0, index, 'vertical');
      // Focusing an empty grid selection initializes row zero; apply the linked row after it.
      gridRef.current?.focus();
      onGridSelectionChange({
        ...emptySelection(),
        current: {
          cell: [0, index],
          range: { x: 0, y: index, width: 1, height: 1 },
          rangeStack: [],
        },
      });
      onRowJumped();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    jumpToRow,
    rows,
    columns.length,
    gridReady,
    onGridSelectionChange,
    onRowJumped,
  ]);

  return (
    <ContextMenu.Root
      disabled={readOnly}
      onOpenChange={(open) => {
        if (open) openedDialog.current = false;
        else setContextColumn(undefined);
      }}
    >
      <ContextMenu.Trigger
        className="grid-context-area"
        onContextMenuCapture={() => setContextColumn(undefined)}
      >
        <DataEditor
          ref={gridRef}
          onVisibleRegionChanged={(range) => {
            if (range.width > 0 && range.height > 0) setGridReady(true);
          }}
          columns={gridColumns}
          rows={rows.length}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          onCellClicked={([, row]) => {
            if (rows[row]) onActiveRowChange(rows[row].id);
          }}
          onHeaderContextMenu={(index) => setContextColumn(columns[index]?.id)}
          onCellContextMenu={([index]) => setContextColumn(columns[index]?.id)}
          gridSelection={gridSelection}
          onGridSelectionChange={onGridSelectionChange}
          getCellsForSelection
          onPaste={!readOnly}
          onColumnResizeEnd={
            readOnly
              ? undefined
              : (_column, width, columnIndex) => {
                  const resized = columns[columnIndex];
                  if (resized) onColumnResize(resized.id, width);
                }
          }
          onColumnMoved={readOnly ? undefined : onColumnsReorder}
          onHeaderMenuClick={(columnIndex) => {
            const column = columns[columnIndex];
            if (column) onColumnMenu(column.id);
          }}
          rightElementProps={{ sticky: true }}
          rightElement={
            <div className="grid-add-column-rail">
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  openedDialog.current = true;
                  onAddColumn();
                }}
                aria-label="Add a column: data, enrichment, research, or formula"
              >
                <Plus aria-hidden="true" />
                <span>Add column</span>
              </button>
              <div className="grid-add-column-hint">
                <Sparkles aria-hidden="true" />
                <strong>Your next step</strong>
                <span>
                  Enrich, research,
                  <br />
                  or calculate.
                </span>
              </div>
            </div>
          }
          rowMarkers={{ kind: 'both', width: 52 }}
          rowSelect="multi"
          rowSelectionMode="multi"
          freezeColumns={phoneGrid ? 0 : 1}
          smoothScrollX
          smoothScrollY
          fillHandle
          height="100%"
          width="100%"
          headerHeight={42}
          rowHeight={compact ? 34 : 46}
          theme={{
            accentColor: '#2f5f48',
            accentFg: '#ffffff',
            accentLight: '#dff5ce',
            bgCell: '#ffffff',
            bgCellMedium: '#f7f7f3',
            bgHeader: '#f5f8f6',
            bgHeaderHovered: '#eaf1ed',
            bgHeaderHasFocus: '#e8f1e4',
            borderColor: '#dde5e0',
            horizontalBorderColor: '#edf1ee',
            textDark: '#1d2a24',
            textMedium: '#4e5d55',
            textLight: '#7c8982',
            fontFamily,
            baseFontStyle: '14px',
            headerFontStyle: '600 14px',
          }}
        />
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner
          className="grid-context-positioner"
          sideOffset={4}
        >
          <ContextMenu.Popup
            className="grid-context-menu"
            finalFocus={() => !openedDialog.current}
          >
            <ContextMenu.Item
              className="grid-context-item"
              onClick={() => {
                openedDialog.current = true;
                onAddColumn();
              }}
            >
              <Plus aria-hidden="true" />
              <span>
                <strong>Add column…</strong>
                <small>Data, enrichment, research & formulas</small>
              </span>
            </ContextMenu.Item>
            {contextColumn ? (
              <ContextMenu.Item
                className="grid-context-item"
                onClick={() => {
                  openedDialog.current = true;
                  onColumnMenu(contextColumn);
                }}
              >
                <Settings2 aria-hidden="true" />
                <span>Column settings</span>
              </ContextMenu.Item>
            ) : null}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
