"use client";

import React, { useState } from "react";
import LockIcon from "@/components/shared/icons/LockIcon";
import useAlert from "@/hooks/useAlert";
import useCredentials from "@/hooks/useCredentials";
import { ApiInstance } from "@/utils";
import { AxiosError } from "axios";

export default function ResetUserPassword({ userId }: { userId: number | string }) {
	const [isResetting, setIsResetting] = useState(false);
	const { accessToken } = useCredentials();
	const { showAndHideAlert } = useAlert();

	async function resetPassword() {
		if (isResetting) return;
		setIsResetting(true);
		try {
			await ApiInstance.post(
				`/users/${userId}/reset-password`,
				{},
				{ headers: { "auth-token": accessToken } }
			);
			showAndHideAlert({ message: "Password reset successfully.", type: "success" });
		} catch (error) {
			const axiosError = error as AxiosError<{ error?: string; message?: string }>;
			showAndHideAlert({
				message:
					axiosError.response?.data?.message ??
					axiosError.response?.data?.error ??
					axiosError.message ??
					"Could not reset the password.",
				type: "error",
			});
		} finally {
			setIsResetting(false);
		}
	}

	return (
		<button
			type="button"
			onClick={() => void resetPassword()}
			disabled={isResetting}
			className="w-full flex items-center gap-x-5 text-2xl py-3 border-b-[#E3E3E3] border-b disabled:opacity-50">
			<LockIcon />
			{isResetting ? "Resetting..." : "Reset Password"}
		</button>
	);
}
