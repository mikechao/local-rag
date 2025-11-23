import {
	TableBody,
	TableCell,
	TableColumnHeader,
	TableHead,
	TableHeader,
	TableHeaderGroup,
	TableProvider,
	TableRow,
} from "@/components/ui/shadcn-io/table";
import type { ColumnDef } from "@tanstack/react-table";
import type { Document } from "@/db/schema";

function formatBytes(bytes: number, decimals = 2) {
	if (!+bytes) return "0 Bytes";

	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

export const columns: ColumnDef<Document>[] = [
	{
		accessorKey: "filename",
		header: ({ column }) => (
			<TableColumnHeader column={column} title="File Name" />
		),
	},
	{
		accessorKey: "mime",
		header: ({ column }) => <TableColumnHeader column={column} title="Type" />,
	},
	{
		accessorKey: "size",
		header: ({ column }) => <TableColumnHeader column={column} title="Size" />,
		cell: ({ row }) => {
			const size = parseFloat(row.getValue("size"));
			return formatBytes(size);
		},
	},
	{
		accessorKey: "createdAt",
		header: ({ column }) => (
			<TableColumnHeader column={column} title="Upload Date" />
		),
		cell: ({ row }) => {
			const date = new Date(row.getValue("createdAt"));
			return date.toLocaleString();
		},
	},
];

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
}

export function DocumentsTable<TData, TValue>({
	columns,
	data,
}: DataTableProps<TData, TValue>) {
	return (
		<div className="rounded-md border">
			<TableProvider columns={columns} data={data}>
				<TableHeader>
					{({ headerGroup }) => (
						<TableHeaderGroup headerGroup={headerGroup}>
							{({ header }) => <TableHead header={header} />}
						</TableHeaderGroup>
					)}
				</TableHeader>
				<TableBody>
					{({ row }) => (
						<TableRow row={row}>
							{({ cell }) => <TableCell cell={cell} />}
						</TableRow>
					)}
				</TableBody>
			</TableProvider>
		</div>
	);
}
