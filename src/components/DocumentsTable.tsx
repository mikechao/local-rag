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
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Document } from "@/db/schema";
import { formatBytes } from "@/lib/utils";
import { useState, useMemo } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { DocumentView } from "./DocumentView";

interface DocumentsTableProps {
	data: Document[];
}

export function DocumentsTable({ data }: DocumentsTableProps) {
	const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

	const columns = useMemo<ColumnDef<Document>[]>(
		() => [
			{
				accessorKey: "filename",
				header: ({ column }) => (
					<TableColumnHeader column={column} title="File Name" />
				),
			},
			{
				accessorKey: "mime",
				header: ({ column }) => (
					<TableColumnHeader column={column} title="Type" />
				),
			},
			{
				accessorKey: "size",
				header: ({ column }) => (
					<TableColumnHeader column={column} title="Size" />
				),
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
			{
				id: "actions",
				cell: ({ row }) => (
					<Button
						variant="neutral"
						size="sm"
						onClick={() => setSelectedDoc(row.original)}
					>
						<Eye className="h-4 w-4" />
						View
					</Button>
				),
			},
		],
		[],
	);

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

			<Dialog
				open={!!selectedDoc}
				onOpenChange={(open) => !open && setSelectedDoc(null)}
			>
				<DialogContent className="max-w-4xl">
					<DialogHeader>
						<DialogTitle>{selectedDoc?.filename}</DialogTitle>
					</DialogHeader>
					{selectedDoc && <DocumentView docId={selectedDoc.id} />}
				</DialogContent>
			</Dialog>
		</div>
	);
}
