import ResetUserPassword from "@/components/shared/ResetUserPassword";

export default function ResetClientPassword({ userId }: { userId: number | string }) {
	return <ResetUserPassword userId={userId} />;
}
