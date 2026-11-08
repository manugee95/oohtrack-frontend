"use client";
import React, { useState } from "react";
import { Form, Formik, FormikHelpers } from "formik";
import FileUploadIcon from "@/components/shared/icons/FileUploadIcon";
import AppButton from "@/components/shared/AppButton";
import DuplicatesFound from "./DuplicatesFound";
import useAlert from "@/hooks/useAlert";
import { AxiosError } from "axios";
import * as Yup from "yup";
import { ApiInstance } from "@/utils";
import useCredentials from "@/hooks/useCredentials";
import { useRouter, useParams } from "next/navigation";
import FileIcon from "@/components/shared/icons/FileIcon";
import CloseIcon from "@/components/shared/icons/CloseIcon";
import * as XLSX from "xlsx";

type CampaignFormProps = {
	forAddMore?: boolean;
};

interface CampaignCreationData {
	clientId?: string;
	accountManagerId?: string;
}

export interface SiteListData extends Record<string, unknown> {
	index: number;
}

function normalizeSerialNumber(row: Record<string, unknown> | null | undefined) {
	if (!row || typeof row !== "object") return "";
	const serialEntry = Object.entries(row).find(([key]) =>
		["sn", "serialnumber", "serialno", "sno", "sitenumber", "code", "sitecode"].includes(
			key.toLowerCase().replace(/[^a-z0-9]/g, "")
		)
	);
	const value = serialEntry?.[1];
	return value == null ? "" : String(value).trim().toLowerCase();
}

const schema = Yup.object().shape({});

export default function CreateCampaignForm({ forAddMore }: CampaignFormProps) {
	const [duplicatesFound, setDuplicatesFound] = useState(false);
	const [duplicateEntries, setDuplicateEntries] = useState<SiteListData[]>([]);
	const { showAndHideAlert } = useAlert();

	const [siteList, setSiteList] = useState<File | null>(null);
	const [jsonSiteList, setJsonSiteList] = useState<SiteListData[]>([]);
	const [campaignData, setCampaignData] = useState<CampaignCreationData>({
		clientId: "",
		accountManagerId: "",
	});

	const { accessToken } = useCredentials();
	const router = useRouter();
	const params = useParams();
	const routeCampaignId = Array.isArray(params.campaignId)
		? params.campaignId[0]
		: params.campaignId;
	const initialValues: CampaignCreationData = {
		clientId: "",
		accountManagerId: "",
	};

	const handleSubmit = async (
		values: CampaignCreationData,
		{ setSubmitting }: FormikHelpers<CampaignCreationData>
	) => {
		try {
			if (!siteList) {
				throw new AxiosError("Please upload campaign sitelist. ");
			}

			await checkDuplicates(siteList, values);

			await uploadCampaign(siteList);

			showAndHideAlert({
				message: "Campaign created successfully",
				type: "success",
			});
			setSubmitting(false);

			router.replace("/campaigns");
		} catch (error) {
			const err = error as AxiosError;
			console.log(err);

			showAndHideAlert({
				//@ts-ignore
				message: err?.response?.data?.error ?? err.message,
				type: "error",
			});
			setSubmitting(false);
		}
	};

	const handleAddMoreSubmit = async (
		values: CampaignCreationData,
		{ setSubmitting }: FormikHelpers<CampaignCreationData>
	) => {
		try {
			if (!siteList) {
				throw new AxiosError("Please upload campaign sitelist. ");
			}

			const fileToUpload = routeCampaignId
				? await extractNewCampaignSites(siteList, String(routeCampaignId))
				: siteList;
			await checkDuplicates(fileToUpload, values);

			await uploadCampaign(fileToUpload);

			showAndHideAlert({
				message: routeCampaignId
					? "Site list added successfully"
					: "Campaign created successfully",
				type: "success",
			});
			setSubmitting(false);

			router.replace("/campaigns");
		} catch (error) {
			const err = error as AxiosError;
			console.log(err);

			showAndHideAlert({
				//@ts-ignore
				message: err?.response?.data?.error ?? err.message,
				type: "error",
			});
			setSubmitting(false);
		}
	};

	async function extractNewCampaignSites(file: File, targetCampaignId: string): Promise<File> {
		const campaignResponse = await ApiInstance.get(`/campaigns/${targetCampaignId}`, {
			headers: { "auth-token": accessToken },
		});
		const campaignPayload = campaignResponse.data;
		const campaign = campaignPayload?.campaign ?? campaignPayload?.data?.campaign ?? campaignPayload?.data ?? campaignPayload;
		const existingSites = Array.isArray(campaign?.siteList)
			? campaign.siteList
			: Array.isArray(campaign?.sites)
				? campaign.sites
				: [];
		const existingSerialNumbers = new Set(
			existingSites
				.map((site: Record<string, unknown>) => normalizeSerialNumber(site))
				.filter(Boolean)
		);

		const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
		const sheetName = workbook.SheetNames[0];
		if (!sheetName) throw new AxiosError("The uploaded file does not contain a site list.");
		const worksheet = workbook.Sheets[sheetName];
		const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
		if (rows.length === 0) throw new AxiosError("The uploaded file does not contain any site rows.");
		const newRows = rows.filter((row) => {
			const serialNumber = normalizeSerialNumber(row);
			return !serialNumber || !existingSerialNumbers.has(serialNumber);
		});

		if (newRows.length === 0) {
			throw new AxiosError("This list has no new sites to add to the selected campaign.");
		}

		const newWorkbook = XLSX.utils.book_new();
		const newWorksheet = XLSX.utils.json_to_sheet(newRows, {
			header: Object.keys(rows[0] ?? {}),
		});
		XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);
		const fileData = XLSX.write(newWorkbook, { bookType: "xlsx", type: "array" });
		return new File([fileData], file.name.replace(/\.(xlsx|xls|csv)$/i, "_new.xlsx"), {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});
	}

	const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) {
			const file = [...e.target.files][0];
			setSiteList(file);
			e.target.value = "";
		}
	};

	async function checkDuplicates(file: File, values: CampaignCreationData) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				if (e.target?.result) {
					const data = new Uint8Array(e.target.result as ArrayBuffer);
					const workbook = XLSX.read(data, { type: "array" });
					const sheetName = workbook.SheetNames[0];
					const worksheet = workbook.Sheets[sheetName];
					const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

					setJsonSiteList(jsonData.map((d, i) => ({ ...d, index: i })));

					const seen = new Set();
					const duplicateEntries: any = [];

					jsonData.forEach((row, index: number) => {
						const rowValues = Object.values(row).join("-");

						// Check for duplicates
						if (seen.has(rowValues)) {
							duplicateEntries.push({ ...row, index });
						} else {
							seen.add(rowValues);
						}
					});

					if (duplicateEntries.length > 0) {
						setDuplicatesFound(true);
						setDuplicateEntries(duplicateEntries);
						setCampaignData(values);
						reject(new Error("Duplicate entries"));
					} else {
						resolve("No duplicates found. File is good to go!");
					}
				}
			};

			reader.readAsArrayBuffer(file);
		});
	}

	async function uploadCampaign(
		file: File | Blob
	) {
		const formData = new FormData();

		if (forAddMore && routeCampaignId) {
			formData.append("campaignId", String(routeCampaignId));
		}

		formData.append(
			"siteList",
			file,
			file instanceof File ? file.name : siteList?.name
		);

		if (forAddMore && routeCampaignId) {
			await ApiInstance.post("sites/upload", formData, {
				headers: {
					"auth-token": accessToken,
				},
			});
		} else {
			await ApiInstance.post("campaigns/create", formData, {
				headers: {
					"auth-token": accessToken,
				},
			});
		}
	}

	function removeDuplicateRow(index: number) {
		const updatedData = jsonSiteList.filter((d) => d.index !== index);
		setJsonSiteList(updatedData);
		setDuplicateEntries(duplicateEntries.filter((d) => d.index !== index));
	}

	function removeMultipleDuplicateRow(indexes: number[]) {
		const updatedData = jsonSiteList.filter((d) => !indexes.includes(d.index));
		setJsonSiteList(updatedData);
		setDuplicateEntries(
			duplicateEntries.filter((d) => !indexes.includes(d.index))
		);
	}

	function convertToFile() {
		// Convert updated data back to a file
		const worksheet = XLSX.utils.json_to_sheet(
			jsonSiteList.map(({ index: _index, ...row }) => row)
		);
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(workbook, worksheet, "Cleaned Data");

		const excelBuffer = XLSX.write(workbook, {
			bookType: "xlsx",
			type: "array",
		});
		const fileBlob = new Blob([excelBuffer], {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});

		return fileBlob;
	}

	async function continueUpload() {
		try {
			const file = convertToFile();
			await uploadCampaign(file);
			showAndHideAlert({
				message: forAddMore && routeCampaignId
					? "Site list added successfully"
					: "Campaign created successfully",
				type: "success",
			});

			router.replace("/campaigns");
		} catch (error) {
			const err = error as AxiosError;
			console.log(err);

			showAndHideAlert({
				//@ts-ignore
				message: err?.response?.data?.error ?? err.message,
				type: "error",
			});
		}
	}

	return (
		<div
			className={`w-full md:w-[85%] ${
				duplicatesFound ? "xl:w-[100%]" : "xl:w-[60%]"
			} bg-white rounded-2xl border border-[#E2E2E2]`}>
			<div className="p-5 md:p-12">
				<h1 className="text-[2.8rem] font-extrabold">
					{forAddMore ? "Add More Sites" : "Create New Campaign"}
				</h1>
			</div>
			<Formik
				validationSchema={schema}
				initialValues={initialValues}
				onSubmit={!forAddMore ? handleSubmit : handleAddMoreSubmit}>
				{({ isSubmitting, isValidating }) => (
					<>
						{duplicatesFound && (
							<DuplicatesFound
								removeDuplicate={removeDuplicateRow}
								duplicates={duplicateEntries}
								cancel={() => {
									setDuplicateEntries([]);
									setJsonSiteList([]);
									setSiteList(null);
									setDuplicatesFound(false);
								}}
								continueUpload={continueUpload}
								removeMultipleDuplicate={removeMultipleDuplicateRow}
							/>
						)}
						{!duplicatesFound && (
							<Form className="w-full flex flex-col gap-y-10 mt-8 px-12 pb-12">
								{forAddMore && routeCampaignId && (
									<p className="text-xl text-gray-600">
										Upload the updated campaign list. Existing S/N rows will be skipped, and only new sites will be added.
									</p>
								)}
								{!siteList && (
									<label htmlFor="sitelist" className="flex flex-col gap-y-3">
										<span className="text-2xl font-semibold">Site list(s)</span>
										<div className="h-[202px] w-full border border-dashed border-[#8D8D8D] p-5 rounded-xl flex flex-col items-center justify-center gap-y-3 cursor-pointer">
											<FileUploadIcon />
											<span className="text-2xl font-medium">
												Click to upload or drag and drop
											</span>
											<span className="text-2xl text-[#9a9a9a]">
												Supported file formats are .xlsx, .xls
											</span>
										</div>
										<input
											accept="application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
											id="sitelist"
											type="file"
											className="hidden"
											onChange={handleFilePick}
										/>
									</label>
								)}
								{siteList && (
									<button
										type="button"
										onClick={() => setSiteList(null)}
										className="cursor-pointer flex flex-row items-center justify-between bg-[#f5f5f5] rounded-xl p-7">
										<div className="flex items-center gap-5">
											<FileIcon />
											<span className="text-2xl text-appBlack">
												{siteList.name}
											</span>
										</div>
										<CloseIcon fill="black" />
									</button>
								)}
								<AppButton
									className="font-semibold"
									fullyRounded
					label={forAddMore ? "Add More Sites" : "Create Campaign"}
									showLoading={!isValidating && isSubmitting}
								/>
							</Form>
						)}
					</>
				)}
			</Formik>
		</div>
	);
}
