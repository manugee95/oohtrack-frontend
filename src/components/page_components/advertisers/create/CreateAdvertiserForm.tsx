"use client";
import React from "react";
import { Form, Formik, FormikHelpers } from "formik";
import AppButton from "@/components/shared/AppButton";
import AppInput from "@/components/shared/AppInput";
import { Advertiser, AdvertiserFormValues } from "@/types";
import useAlert from "@/hooks/useAlert";
import { AxiosError } from "axios";
import { useRouter } from "next/navigation";
import * as Yup from "yup";
import { ApiInstance } from "@/utils";
import useCredentials from "@/hooks/useCredentials";
import AdvertiserCategory from "./AdvertiserCategory";

const schema = Yup.object().shape({
	name: Yup.string().required().label("Name"),
	categoryIds: Yup.array(Yup.number())
		.min(1, "Select at least one category")
		.required()
		.label("Categories"),
});

interface AdvertiserFormProps {
	isEditing?: boolean;
	initialValues?: Advertiser;
	advertiserId?: string | number;
	editCallback?: (data: any) => void;
}

export default function CreateAdvertiserForm({
	isEditing,
	initialValues = {
		name: "",
	categoryIds: [],
	},
	advertiserId,
	editCallback,
}: AdvertiserFormProps) {
	const { showAndHideAlert } = useAlert();
	const router = useRouter();
	const { accessToken } = useCredentials();

	const submitHandler = async (
		values: AdvertiserFormValues,
		{ setSubmitting }: FormikHelpers<AdvertiserFormValues>
	) => {
		try {
			const payload: Advertiser = {
				...values,
				categories: (values.categoryIds ?? []).map(Number),
			};
			delete payload.category;
			delete payload.categoryIds;
			delete payload.categoryId;

			if (!isEditing) {
				await ApiInstance.post("/api/advertisers", payload, {
					headers: {
						"auth-token": accessToken,
					},
				});

				showAndHideAlert({
					message: "Advertiser created successfully.",
					type: "success",
				});

				setSubmitting(false);

				router.push("/advertisers");
			} else {
				const res = await ApiInstance.put(
					"/api/advertiser/" + advertiserId,
					payload,
					{
						headers: {
							"auth-token": accessToken,
						},
					}
				);

				showAndHideAlert({
					message: "Advertiser updated successfully.",
					type: "success",
				});

				setSubmitting(false);

				// @ts-ignore
				editCallback(res.data);
			}
		} catch (error) {
			const err = error as AxiosError;
			console.log(err);

			showAndHideAlert({
				//@ts-ignore
				message: err?.response?.data?.error,
				type: "error",
			});
			setSubmitting(false);
		}
	};

	return (
		<div
			className={`w-full ${
				!isEditing ? "md:w-[85%] xl:w-[60%]" : ""
			} bg-white rounded-2xl border border-[#E2E2E2]`}>
			<div className="p-5 md:p-12">
				<h1 className="text-[2.8rem] font-extrabold">
					{!isEditing ? "Add New Advertiser" : "Edit Advertiser"}
				</h1>
			</div>

			<Formik<AdvertiserFormValues>
				validationSchema={schema}
				initialValues={{
					...initialValues,
					categoryIds:
						initialValues.categoryIds ??
						(initialValues.categories?.length
							? initialValues.categories
								.map((category) => typeof category === "object" ? category.id : category)
								.filter((id): id is number | string => id != null)
							: initialValues.categoryId != null
								? [initialValues.categoryId]
								: initialValues.category?.id != null
									? [initialValues.category.id]
									: []),
				}}
				onSubmit={submitHandler}>
				{({ isSubmitting, isValidating }) => (
					<Form className="w-full flex flex-col gap-y-10 mt-8 px-12 pb-12">
						<div className="grid  gap-10">
							<div className="w-full">
								<AppInput label="Name" name="name" placeholder="Name" />
							</div>
						</div>
						<AdvertiserCategory />
						<AppButton
							className="font-semibold"
							fullyRounded
							label={!isEditing ? "Create Advertiser" : "Edit Advertiser"}
							showLoading={!isValidating && isSubmitting}
						/>
					</Form>
				)}
			</Formik>
		</div>
	);
}
