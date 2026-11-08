import { ApiInstance } from "@/utils";
import { AccountManager, Advertiser, Client, FieldAuditor } from "@/types";
import useCredentials from "./useCredentials";

function normalizeClientPage(payload: any) {
	const candidates = [
		payload,
		payload?.data,
		payload?.clients,
		payload?.users,
		payload?.results,
		payload?.rows,
		payload?.data?.data,
		payload?.data?.clients,
		payload?.data?.users,
		payload?.data?.results,
		payload?.data?.rows,
		payload?.data?.data?.clients,
		payload?.data?.data?.users,
	];
	const clients = candidates.find(Array.isArray) ?? [];
	const totalPages =
		payload?.totalPages ??
		payload?.pagination?.totalPages ??
		payload?.meta?.totalPages ??
		payload?.data?.totalPages ??
		payload?.data?.pagination?.totalPages ??
		payload?.data?.meta?.totalPages ??
		1;

	return { ...payload, data: clients, totalPages };
}

export default function useUserManagement() {
	const { accessToken } = useCredentials();

	const createUser = async (data: AccountManager | FieldAuditor | Client) => {
		try {
			const response = await ApiInstance.post("/users/create", data, {
				headers: {
					"auth-token": accessToken,
				},
			});
			return response.data;
		} catch (error) {
			throw error;
		}
	};

	const getUsers = async (page: number) => {
		try {
			const response = await ApiInstance.get(`/users?page=${page}`, {
				headers: {
					"auth-token": accessToken,
				},
			});
			return response.data;
		} catch (error) {
			throw error;
		}
	};

	const getClients = async (page: number, search: string) => {
		try {
			const response = await ApiInstance.get(
				`/users/clients?page=${page}&search=${search}`,
				{
					headers: {
						"auth-token": accessToken,
					},
				}
			);
			return normalizeClientPage(response.data);
		} catch (error) {
			throw error;
		}
	};

	const getAccountManagers = async (page: number, search: string) => {
		try {
			const response = await ApiInstance.get(
				`/users/account-managers?page=${page}&search=${search}`,
				{
					headers: {
						"auth-token": accessToken,
					},
				}
			);
			return response.data;
		} catch (error) {
			throw error;
		}
	};

	const getFieldAuditors = async (page: number, search: string) => {
		try {
			const response = await ApiInstance.get(
				`/users/field-auditors?page=${page}&search=${search}`,
				{
					headers: {
						"auth-token": accessToken,
					},
				}
			);
			return response.data;
		} catch (error) {
			throw error;
		}
	};

	const updateUser = async (
		userId: number,
		data: AccountManager | FieldAuditor | Client
	) => {
		try {
			const response = await ApiInstance.put("/api/users/" + userId, data, {
				headers: {
					"auth-token": accessToken,
				},
			});
			return response.data;
		} catch (error) {
			throw error;
		}
	};

	return {
		createUser,
		getUsers,
		updateUser,
		getClients,
		getAccountManagers,
		getFieldAuditors,
	};
}
