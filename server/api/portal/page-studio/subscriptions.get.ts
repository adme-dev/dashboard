import { requireClientAuth } from "~~/server/utils/clientAuth";
import { pageStudioHttpError } from "~~/server/utils/pageStudio/http";
import { listPortalPageStudioSubscriptions } from "~~/server/utils/pageStudio/operations";

export default eventHandler(async (event) => {
	try {
		const user = await requireClientAuth(event);
		return {
			subscriptions: await listPortalPageStudioSubscriptions(user.clientId),
		};
	} catch (error) {
		pageStudioHttpError(error);
	}
});
