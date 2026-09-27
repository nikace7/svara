export interface paths {
    "/api/v1/health/live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["health_live"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["health_ready"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["auth_register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["auth_login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["auth_session"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/csrf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["auth_csrf"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["auth_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/organisation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["auth_switchOrganisation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/activate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["auth_activate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/recover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["auth_recover"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["members_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/members/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["members_invite"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/members/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["members_update"];
        trace?: never;
    };
    "/api/v1/members/{id}/recovery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["members_recover"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/organisation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["organisation_update"];
        trace?: never;
    };
    "/api/v1/bots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["bots_list"];
        put?: never;
        post: operations["bots_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bots/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["bots_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["bots_save"];
        trace?: never;
    };
    "/api/v1/bots/{id}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["bots_archive"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bots/{botId}/knowledge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["botknowledge_list"];
        put?: never;
        post: operations["botknowledge_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/knowledge/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["knowledge_get"];
        put?: never;
        post?: never;
        delete: operations["knowledge_remove"];
        options?: never;
        head?: never;
        patch: operations["knowledge_save"];
        trace?: never;
    };
    "/api/v1/knowledge/{id}/approval": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["knowledge_approve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/knowledge/{id}/selection": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["knowledge_select"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["media_list"];
        put?: never;
        post: operations["media_upload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/media/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["media_get"];
        put?: never;
        post?: never;
        delete: operations["media_remove"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/media/{id}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["media_content"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/media/{id}/thumbnail": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["media_thumbnail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/presentations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["presentations_list"];
        put?: never;
        post: operations["presentations_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/presentations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["presentations_get"];
        put?: never;
        post?: never;
        delete: operations["presentations_remove"];
        options?: never;
        head?: never;
        patch: operations["presentations_save"];
        trace?: never;
    };
    "/api/v1/presentations/{id}/slides": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["presentations_createSlide"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/presentations/{id}/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["presentations_reorder"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/slides/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["slides_remove"];
        options?: never;
        head?: never;
        patch: operations["slides_save"];
        trace?: never;
    };
    "/api/v1/bots/{botId}/presentation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["botpresentation_select"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bots/{botId}/releases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["botreleases_list"];
        put?: never;
        post: operations["botreleases_publish"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bots/{botId}/releases/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["botreleases_validate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bots/{botId}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["botreleases_preview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/releases/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["releases_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/releases/{id}/knowledge/query": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["releases_search"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["events_list"];
        put?: never;
        post: operations["events_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["events_save"];
        trace?: never;
    };
    "/api/v1/events/{id}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["events_archive"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deployments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["deployments_board"];
        put?: never;
        post: operations["deployments_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/deployments/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["deployments_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["deployments_save"];
        trace?: never;
    };
    "/api/v1/deployments/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["deployments_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/devices/{id}/override": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["deviceschedule_override"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/devices/{id}/timeline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["deviceschedule_timeline"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        HealthData: {
            /** @enum {string} */
            status: "ok" | "ready" | "unavailable";
            /** @enum {string} */
            service: "api";
            /** @enum {string} */
            providerMode: "fixture" | "live";
            dependencies?: {
                [key: string]: "ready" | "unavailable";
            };
        };
        HealthResponse: {
            data: components["schemas"]["HealthData"];
        };
        RegisterDto: {
            /** Format: email */
            email: string;
            password: Record<string, never>;
            displayName: string;
            organisationName: string;
        };
        StaffUserDto: {
            /** Format: uuid */
            id: string;
            /** Format: email */
            email: string;
            displayName: string;
        };
        MembershipBriefDto: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            role: "OWNER" | "ADMINISTRATOR" | "OPERATOR" | "VIEWER";
        };
        OrganisationDto: {
            /** Format: uuid */
            id: string;
            name: string;
            timezone: string;
        };
        OrganisationBriefDto: {
            /** Format: uuid */
            id: string;
            name: string;
        };
        AvailableMembershipDto: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            role: "OWNER" | "ADMINISTRATOR" | "OPERATOR" | "VIEWER";
            organisation: components["schemas"]["OrganisationBriefDto"];
        };
        StaffIdentityDto: {
            user: components["schemas"]["StaffUserDto"];
            membership: components["schemas"]["MembershipBriefDto"];
            organisation: components["schemas"]["OrganisationDto"];
            memberships: components["schemas"]["AvailableMembershipDto"][];
        };
        StaffSessionData: {
            identity: components["schemas"]["StaffIdentityDto"];
            csrfToken: string;
        };
        StaffSessionResponse: {
            data: components["schemas"]["StaffSessionData"];
        };
        LoginDto: {
            /** Format: email */
            email: string;
            password: string;
        };
        CsrfData: {
            csrfToken: string;
        };
        CsrfResponse: {
            data: components["schemas"]["CsrfData"];
        };
        ResultData: {
            ok: boolean;
        };
        ResultResponse: {
            data: components["schemas"]["ResultData"];
        };
        SwitchOrganisationDto: {
            /** Format: uuid */
            organisationId: string;
        };
        ActivateDto: {
            token: string;
            password: string;
            displayName: string;
        };
        RecoverDto: {
            token: string;
            password: string;
        };
        StaffMemberDto: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            role: "OWNER" | "ADMINISTRATOR" | "OPERATOR" | "VIEWER";
            enabled: boolean;
            user: components["schemas"]["StaffUserDto"];
        };
        MembersResponse: {
            data: components["schemas"]["StaffMemberDto"][];
        };
        InviteDto: {
            /** Format: email */
            email: string;
            /** @enum {string} */
            role: "OWNER" | "ADMINISTRATOR" | "OPERATOR" | "VIEWER";
        };
        AccessLinkData: {
            /**
             * Format: uri
             * @description One-use activation/recovery link, returned once. Token is in the fragment.
             */
            url: string;
            /** Format: date-time */
            expiresAt: string;
        };
        AccessLinkResponse: {
            data: components["schemas"]["AccessLinkData"];
        };
        MemberUpdateDto: {
            /** @enum {string} */
            role: "OWNER" | "ADMINISTRATOR" | "OPERATOR" | "VIEWER";
            enabled: boolean;
        };
        MemberResponse: {
            data: components["schemas"]["StaffMemberDto"];
        };
        OrganisationUpdateDto: {
            name: string;
            timezone: string;
        };
        OrganisationResponse: {
            data: components["schemas"]["OrganisationDto"];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    health_live: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The API process is running. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
        };
    };
    health_ready: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Local dependencies and worker heartbeat are ready. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
            /** @description At least one dependency is unavailable. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
        };
    };
    auth_register: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffSessionResponse"];
                };
            };
        };
    };
    auth_login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffSessionResponse"];
                };
            };
        };
    };
    auth_session: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffSessionResponse"];
                };
            };
        };
    };
    auth_csrf: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CsrfResponse"];
                };
            };
        };
    };
    auth_logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResultResponse"];
                };
            };
        };
    };
    auth_switchOrganisation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SwitchOrganisationDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StaffSessionResponse"];
                };
            };
        };
    };
    auth_activate: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActivateDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResultResponse"];
                };
            };
        };
    };
    auth_recover: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RecoverDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResultResponse"];
                };
            };
        };
    };
    members_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembersResponse"];
                };
            };
        };
    };
    members_invite: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InviteDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessLinkResponse"];
                };
            };
        };
    };
    members_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MemberUpdateDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MemberResponse"];
                };
            };
        };
    };
    members_recover: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessLinkResponse"];
                };
            };
        };
    };
    organisation_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrganisationUpdateDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrganisationResponse"];
                };
            };
        };
    };
    bots_list: {
        parameters: {
            query?: {
                includeArchived?: "true" | "false";
                pageSize?: number;
                page?: number;
                search?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            items: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                                description: string;
                                revision: number;
                                /** Format: date-time */
                                archivedAt: string | null;
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                updatedAt: string;
                            }[];
                            total: number;
                            page: number;
                            pageSize: number;
                        };
                    };
                };
            };
        };
    };
    bots_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @default  */
                    description?: string;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            description: string;
                            revision: number;
                            /** Format: date-time */
                            archivedAt: string | null;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                            draft: {
                                persona: string;
                                greeting: {
                                    en: string;
                                    ne: string;
                                };
                                fallback: {
                                    en: string;
                                    ne: string;
                                };
                                /** @enum {string} */
                                voiceEn: "en-US-JennyNeural";
                                /** @enum {string} */
                                voiceNe: "ne-NP-HemkalaNeural" | "ne-NP-SagarNeural";
                                tools: ("lookup_knowledge" | "get_event_schedule" | "select_reference" | "show_slide")[];
                            };
                        };
                    };
                };
            };
        };
    };
    bots_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            description: string;
                            revision: number;
                            /** Format: date-time */
                            archivedAt: string | null;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                            draft: {
                                persona: string;
                                greeting: {
                                    en: string;
                                    ne: string;
                                };
                                fallback: {
                                    en: string;
                                    ne: string;
                                };
                                /** @enum {string} */
                                voiceEn: "en-US-JennyNeural";
                                /** @enum {string} */
                                voiceNe: "ne-NP-HemkalaNeural" | "ne-NP-SagarNeural";
                                tools: ("lookup_knowledge" | "get_event_schedule" | "select_reference" | "show_slide")[];
                            };
                        };
                    };
                };
            };
        };
    };
    bots_save: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    description: string;
                    draft: {
                        persona: string;
                        greeting: {
                            en: string;
                            ne: string;
                        };
                        fallback: {
                            en: string;
                            ne: string;
                        };
                        /** @enum {string} */
                        voiceEn: "en-US-JennyNeural";
                        /** @enum {string} */
                        voiceNe: "ne-NP-HemkalaNeural" | "ne-NP-SagarNeural";
                        tools: ("lookup_knowledge" | "get_event_schedule" | "select_reference" | "show_slide")[];
                    };
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            description: string;
                            revision: number;
                            /** Format: date-time */
                            archivedAt: string | null;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                            draft: {
                                persona: string;
                                greeting: {
                                    en: string;
                                    ne: string;
                                };
                                fallback: {
                                    en: string;
                                    ne: string;
                                };
                                /** @enum {string} */
                                voiceEn: "en-US-JennyNeural";
                                /** @enum {string} */
                                voiceNe: "ne-NP-HemkalaNeural" | "ne-NP-SagarNeural";
                                tools: ("lookup_knowledge" | "get_event_schedule" | "select_reference" | "show_slide")[];
                            };
                        };
                    };
                };
            };
            /** @description Revision conflict or archived bot. The error includes currentRevision. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description expectedRevision is required. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    bots_archive: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    archived: boolean;
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            description: string;
                            revision: number;
                            /** Format: date-time */
                            archivedAt: string | null;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                            draft: {
                                persona: string;
                                greeting: {
                                    en: string;
                                    ne: string;
                                };
                                fallback: {
                                    en: string;
                                    ne: string;
                                };
                                /** @enum {string} */
                                voiceEn: "en-US-JennyNeural";
                                /** @enum {string} */
                                voiceNe: "ne-NP-HemkalaNeural" | "ne-NP-SagarNeural";
                                tools: ("lookup_knowledge" | "get_event_schedule" | "select_reference" | "show_slide")[];
                            };
                        };
                    };
                };
            };
            /** @description Revision conflict; reload the draft before archiving or restoring. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description expectedRevision is required. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    botknowledge_list: {
        parameters: {
            query?: {
                type?: "ALL" | "FAQ" | "NOTE";
                status?: "ALL" | "DRAFT" | "APPROVED";
                pageSize?: number;
                page?: number;
                search?: string;
            };
            header?: never;
            path: {
                botId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            items: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                botId: string;
                                /** @enum {string} */
                                type: "FAQ" | "NOTE";
                                title: string;
                                /** @enum {string} */
                                status: "DRAFT" | "APPROVED";
                                selected: boolean;
                                revision: number;
                                complete: {
                                    en: boolean;
                                    ne: boolean;
                                };
                                /** Format: date-time */
                                approvedAt: string | null;
                                /** Format: date-time */
                                updatedAt: string;
                            }[];
                            total: number;
                            page: number;
                            pageSize: number;
                        };
                    };
                };
            };
        };
    };
    botknowledge_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                botId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    type: "FAQ" | "NOTE";
                    title: string;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            /** @enum {string} */
                            type: "FAQ" | "NOTE";
                            title: string;
                            /** @enum {string} */
                            status: "DRAFT" | "APPROVED";
                            selected: boolean;
                            revision: number;
                            complete: {
                                en: boolean;
                                ne: boolean;
                            };
                            /** Format: date-time */
                            approvedAt: string | null;
                            /** Format: date-time */
                            updatedAt: string;
                            content: {
                                en: string;
                                ne: string;
                            };
                            question: {
                                en: string;
                                ne: string;
                            };
                            botRevision: number;
                            /** Format: date-time */
                            botArchivedAt: string | null;
                        };
                    };
                };
            };
        };
    };
    knowledge_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            /** @enum {string} */
                            type: "FAQ" | "NOTE";
                            title: string;
                            /** @enum {string} */
                            status: "DRAFT" | "APPROVED";
                            selected: boolean;
                            revision: number;
                            complete: {
                                en: boolean;
                                ne: boolean;
                            };
                            /** Format: date-time */
                            approvedAt: string | null;
                            /** Format: date-time */
                            updatedAt: string;
                            content: {
                                en: string;
                                ne: string;
                            };
                            question: {
                                en: string;
                                ne: string;
                            };
                            botRevision: number;
                            /** Format: date-time */
                            botArchivedAt: string | null;
                        };
                    };
                };
            };
            /** @description Revision conflict or archived parent bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    knowledge_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** @enum {boolean} */
                            ok: true;
                            botRevision: number;
                        };
                    };
                };
            };
            /** @description Revision conflict or archived parent bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    knowledge_save: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    type: "FAQ" | "NOTE";
                    title: string;
                    content: {
                        en: string;
                        ne: string;
                    };
                    question: {
                        en: string;
                        ne: string;
                    };
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            /** @enum {string} */
                            type: "FAQ" | "NOTE";
                            title: string;
                            /** @enum {string} */
                            status: "DRAFT" | "APPROVED";
                            selected: boolean;
                            revision: number;
                            complete: {
                                en: boolean;
                                ne: boolean;
                            };
                            /** Format: date-time */
                            approvedAt: string | null;
                            /** Format: date-time */
                            updatedAt: string;
                            content: {
                                en: string;
                                ne: string;
                            };
                            question: {
                                en: string;
                                ne: string;
                            };
                            botRevision: number;
                            /** Format: date-time */
                            botArchivedAt: string | null;
                        };
                    };
                };
            };
            /** @description Revision conflict or archived parent bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    knowledge_approve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expectedRevision: number;
                    approved: boolean;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            /** @enum {string} */
                            type: "FAQ" | "NOTE";
                            title: string;
                            /** @enum {string} */
                            status: "DRAFT" | "APPROVED";
                            selected: boolean;
                            revision: number;
                            complete: {
                                en: boolean;
                                ne: boolean;
                            };
                            /** Format: date-time */
                            approvedAt: string | null;
                            /** Format: date-time */
                            updatedAt: string;
                            content: {
                                en: string;
                                ne: string;
                            };
                            question: {
                                en: string;
                                ne: string;
                            };
                            botRevision: number;
                            /** Format: date-time */
                            botArchivedAt: string | null;
                        };
                    };
                };
            };
            /** @description Revision conflict or archived parent bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing bilingual content; fieldErrors identify the content/question and locale. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    knowledge_select: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expectedRevision: number;
                    selected: boolean;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            /** @enum {string} */
                            type: "FAQ" | "NOTE";
                            title: string;
                            /** @enum {string} */
                            status: "DRAFT" | "APPROVED";
                            selected: boolean;
                            revision: number;
                            complete: {
                                en: boolean;
                                ne: boolean;
                            };
                            /** Format: date-time */
                            approvedAt: string | null;
                            /** Format: date-time */
                            updatedAt: string;
                            content: {
                                en: string;
                                ne: string;
                            };
                            question: {
                                en: string;
                                ne: string;
                            };
                            botRevision: number;
                            /** Format: date-time */
                            botArchivedAt: string | null;
                        };
                    };
                };
            };
            /** @description Revision conflict or archived parent bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    media_list: {
        parameters: {
            query?: {
                pageSize?: number;
                page?: number;
                kind?: "ALL" | "IMAGE" | "VIDEO";
                state?: "ALL" | "UPLOADING" | "RECEIVING" | "QUARANTINED" | "INSPECTING" | "READY" | "REJECTED" | "DELETING";
                search?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            items: {
                                /** Format: uuid */
                                id: string;
                                filename: string;
                                /** @enum {string} */
                                mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                /** @enum {string} */
                                state: "UPLOADING" | "RECEIVING" | "QUARANTINED" | "INSPECTING" | "READY" | "REJECTED" | "DELETING";
                                revision: number;
                                uploadedBytes: number;
                                byteLength: number | null;
                                sha256: string | null;
                                width: number | null;
                                height: number | null;
                                durationSeconds: number | null;
                                hasThumbnail: boolean;
                                /** @enum {string|null} */
                                rejection: "UPLOAD_INTERRUPTED" | "UPLOAD_LENGTH_MISMATCH" | "UNSUPPORTED_FORMAT" | "INVALID_MEDIA" | "IMAGE_TOO_LARGE" | "VIDEO_LIMITS" | "UNSUPPORTED_CODEC" | "INSPECTION_TIMEOUT" | "INSPECTION_UNAVAILABLE" | "INTEGRITY_MISMATCH" | "UPLOAD_EXPIRED" | null;
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                updatedAt: string;
                            }[];
                            total: number;
                            page: number;
                            pageSize: number;
                        };
                    };
                };
            };
        };
    };
    media_upload: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    /** @description First part: JSON with filename (up to 160 characters), mimeType (image/jpeg, image/png or video/mp4) and exact byteLength. Images up to 10 MiB, videos up to 50 MiB. */
                    metadata: string;
                    /** Format: binary */
                    file: string;
                };
            };
        };
        responses: {
            /** @description Private upload received; inspection is pending. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            filename: string;
                            /** @enum {string} */
                            mimeType: "image/jpeg" | "image/png" | "video/mp4";
                            /** @enum {string} */
                            state: "UPLOADING" | "RECEIVING" | "QUARANTINED" | "INSPECTING" | "READY" | "REJECTED" | "DELETING";
                            revision: number;
                            uploadedBytes: number;
                            byteLength: number | null;
                            sha256: string | null;
                            width: number | null;
                            height: number | null;
                            durationSeconds: number | null;
                            hasThumbnail: boolean;
                            /** @enum {string|null} */
                            rejection: "UPLOAD_INTERRUPTED" | "UPLOAD_LENGTH_MISMATCH" | "UNSUPPORTED_FORMAT" | "INVALID_MEDIA" | "IMAGE_TOO_LARGE" | "VIDEO_LIMITS" | "UNSUPPORTED_CODEC" | "INSPECTION_TIMEOUT" | "INSPECTION_UNAVAILABLE" | "INTEGRITY_MISMATCH" | "UPLOAD_EXPIRED" | null;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        };
                    };
                };
            };
            /** @description Uploaded byte count differs from metadata. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Organisation media budget or request quota reached. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    media_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            filename: string;
                            /** @enum {string} */
                            mimeType: "image/jpeg" | "image/png" | "video/mp4";
                            /** @enum {string} */
                            state: "UPLOADING" | "RECEIVING" | "QUARANTINED" | "INSPECTING" | "READY" | "REJECTED" | "DELETING";
                            revision: number;
                            uploadedBytes: number;
                            byteLength: number | null;
                            sha256: string | null;
                            width: number | null;
                            height: number | null;
                            durationSeconds: number | null;
                            hasThumbnail: boolean;
                            /** @enum {string|null} */
                            rejection: "UPLOAD_INTERRUPTED" | "UPLOAD_LENGTH_MISMATCH" | "UNSUPPORTED_FORMAT" | "INVALID_MEDIA" | "IMAGE_TOO_LARGE" | "VIDEO_LIMITS" | "UNSUPPORTED_CODEC" | "INSPECTION_TIMEOUT" | "INSPECTION_UNAVAILABLE" | "INTEGRITY_MISMATCH" | "UPLOAD_EXPIRED" | null;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        };
                    };
                };
            };
        };
    };
    media_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** @enum {boolean} */
                            ok: true;
                        };
                    };
                };
            };
            /** @description Revision changed or processing is busy. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Deletion requires expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    media_content: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "image/png": string;
                    "image/jpeg": string;
                    "video/mp4": string;
                };
            };
            /** @description One byte range of the ready object. */
            206: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "image/png": string;
                    "image/jpeg": string;
                    "video/mp4": string;
                };
            };
            /** @description Media is not ready. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid or unsatisfiable range; Content-Range reports the object size. */
            416: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    media_thumbnail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "image/png": string;
                };
            };
        };
    };
    presentations_list: {
        parameters: {
            query: {
                botId: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            botId: string;
                            botRevision: number;
                            /** Format: date-time */
                            botArchivedAt: string | null;
                            /** Format: uuid */
                            selectedPresentationId: string | null;
                            items: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                botId: string;
                                name: string;
                                revision: number;
                                /** Format: date-time */
                                updatedAt: string;
                                slideCount: number;
                            }[];
                        };
                    };
                };
            };
            /** @description Revision conflict, changed slide set or archived bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require the current presentation expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    presentations_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    botId: string;
                    name: string;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            name: string;
                            revision: number;
                            /** Format: date-time */
                            updatedAt: string;
                            slideCount: number;
                            botRevision: number;
                            /** Format: date-time */
                            botArchivedAt: string | null;
                            selected: boolean;
                            slides: {
                                title: {
                                    en: string;
                                    ne: string;
                                };
                                body: {
                                    en: string;
                                    ne: string;
                                };
                                /** Format: uuid */
                                mediaId: string | null;
                                /** @enum {string} */
                                target: "PRIMARY" | "SECONDARY" | "BOTH";
                                durationSeconds: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                presentationId: string;
                                revision: number;
                                position: number;
                                media: {
                                    /** Format: uuid */
                                    id: string;
                                    filename: string;
                                    /** @enum {string} */
                                    mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                    /** @enum {string} */
                                    state: "UPLOADING" | "RECEIVING" | "QUARANTINED" | "INSPECTING" | "READY" | "REJECTED" | "DELETING";
                                    revision: number;
                                    uploadedBytes: number;
                                    byteLength: number | null;
                                    sha256: string | null;
                                    width: number | null;
                                    height: number | null;
                                    durationSeconds: number | null;
                                    hasThumbnail: boolean;
                                    /** @enum {string|null} */
                                    rejection: "UPLOAD_INTERRUPTED" | "UPLOAD_LENGTH_MISMATCH" | "UNSUPPORTED_FORMAT" | "INVALID_MEDIA" | "IMAGE_TOO_LARGE" | "VIDEO_LIMITS" | "UNSUPPORTED_CODEC" | "INSPECTION_TIMEOUT" | "INSPECTION_UNAVAILABLE" | "INTEGRITY_MISMATCH" | "UPLOAD_EXPIRED" | null;
                                    /** Format: date-time */
                                    createdAt: string;
                                    /** Format: date-time */
                                    updatedAt: string;
                                } | null;
                                complete: {
                                    en: boolean;
                                    ne: boolean;
                                };
                            }[];
                        };
                    };
                };
            };
            /** @description Revision conflict, changed slide set or archived bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bot presentation limit reached. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require the current presentation expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    presentations_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            name: string;
                            revision: number;
                            /** Format: date-time */
                            updatedAt: string;
                            slideCount: number;
                            botRevision: number;
                            /** Format: date-time */
                            botArchivedAt: string | null;
                            selected: boolean;
                            slides: {
                                title: {
                                    en: string;
                                    ne: string;
                                };
                                body: {
                                    en: string;
                                    ne: string;
                                };
                                /** Format: uuid */
                                mediaId: string | null;
                                /** @enum {string} */
                                target: "PRIMARY" | "SECONDARY" | "BOTH";
                                durationSeconds: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                presentationId: string;
                                revision: number;
                                position: number;
                                media: {
                                    /** Format: uuid */
                                    id: string;
                                    filename: string;
                                    /** @enum {string} */
                                    mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                    /** @enum {string} */
                                    state: "UPLOADING" | "RECEIVING" | "QUARANTINED" | "INSPECTING" | "READY" | "REJECTED" | "DELETING";
                                    revision: number;
                                    uploadedBytes: number;
                                    byteLength: number | null;
                                    sha256: string | null;
                                    width: number | null;
                                    height: number | null;
                                    durationSeconds: number | null;
                                    hasThumbnail: boolean;
                                    /** @enum {string|null} */
                                    rejection: "UPLOAD_INTERRUPTED" | "UPLOAD_LENGTH_MISMATCH" | "UNSUPPORTED_FORMAT" | "INVALID_MEDIA" | "IMAGE_TOO_LARGE" | "VIDEO_LIMITS" | "UNSUPPORTED_CODEC" | "INSPECTION_TIMEOUT" | "INSPECTION_UNAVAILABLE" | "INTEGRITY_MISMATCH" | "UPLOAD_EXPIRED" | null;
                                    /** Format: date-time */
                                    createdAt: string;
                                    /** Format: date-time */
                                    updatedAt: string;
                                } | null;
                                complete: {
                                    en: boolean;
                                    ne: boolean;
                                };
                            }[];
                        };
                    };
                };
            };
            /** @description Revision conflict, changed slide set or archived bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require the current presentation expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    presentations_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** @enum {boolean} */
                            ok: true;
                            botRevision: number;
                        };
                    };
                };
            };
            /** @description Revision conflict, changed slide set or archived bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require the current presentation expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    presentations_save: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            name: string;
                            revision: number;
                            /** Format: date-time */
                            updatedAt: string;
                            slideCount: number;
                            botRevision: number;
                            /** Format: date-time */
                            botArchivedAt: string | null;
                            selected: boolean;
                            slides: {
                                title: {
                                    en: string;
                                    ne: string;
                                };
                                body: {
                                    en: string;
                                    ne: string;
                                };
                                /** Format: uuid */
                                mediaId: string | null;
                                /** @enum {string} */
                                target: "PRIMARY" | "SECONDARY" | "BOTH";
                                durationSeconds: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                presentationId: string;
                                revision: number;
                                position: number;
                                media: {
                                    /** Format: uuid */
                                    id: string;
                                    filename: string;
                                    /** @enum {string} */
                                    mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                    /** @enum {string} */
                                    state: "UPLOADING" | "RECEIVING" | "QUARANTINED" | "INSPECTING" | "READY" | "REJECTED" | "DELETING";
                                    revision: number;
                                    uploadedBytes: number;
                                    byteLength: number | null;
                                    sha256: string | null;
                                    width: number | null;
                                    height: number | null;
                                    durationSeconds: number | null;
                                    hasThumbnail: boolean;
                                    /** @enum {string|null} */
                                    rejection: "UPLOAD_INTERRUPTED" | "UPLOAD_LENGTH_MISMATCH" | "UNSUPPORTED_FORMAT" | "INVALID_MEDIA" | "IMAGE_TOO_LARGE" | "VIDEO_LIMITS" | "UNSUPPORTED_CODEC" | "INSPECTION_TIMEOUT" | "INSPECTION_UNAVAILABLE" | "INTEGRITY_MISMATCH" | "UPLOAD_EXPIRED" | null;
                                    /** Format: date-time */
                                    createdAt: string;
                                    /** Format: date-time */
                                    updatedAt: string;
                                } | null;
                                complete: {
                                    en: boolean;
                                    ne: boolean;
                                };
                            }[];
                        };
                    };
                };
            };
            /** @description Revision conflict, changed slide set or archived bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require the current presentation expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    presentations_createSlide: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @default {
                     *       "en": "",
                     *       "ne": ""
                     *     }
                     */
                    title?: {
                        en: string;
                        ne: string;
                    };
                    /**
                     * @default {
                     *       "en": "",
                     *       "ne": ""
                     *     }
                     */
                    body?: {
                        en: string;
                        ne: string;
                    };
                    /**
                     * Format: uuid
                     * @default null
                     */
                    mediaId?: string | null;
                    /**
                     * @default BOTH
                     * @enum {string}
                     */
                    target?: "PRIMARY" | "SECONDARY" | "BOTH";
                    /** @default 10 */
                    durationSeconds?: number;
                    expectedRevision: number;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            name: string;
                            revision: number;
                            /** Format: date-time */
                            updatedAt: string;
                            slideCount: number;
                            botRevision: number;
                            /** Format: date-time */
                            botArchivedAt: string | null;
                            selected: boolean;
                            slides: {
                                title: {
                                    en: string;
                                    ne: string;
                                };
                                body: {
                                    en: string;
                                    ne: string;
                                };
                                /** Format: uuid */
                                mediaId: string | null;
                                /** @enum {string} */
                                target: "PRIMARY" | "SECONDARY" | "BOTH";
                                durationSeconds: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                presentationId: string;
                                revision: number;
                                position: number;
                                media: {
                                    /** Format: uuid */
                                    id: string;
                                    filename: string;
                                    /** @enum {string} */
                                    mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                    /** @enum {string} */
                                    state: "UPLOADING" | "RECEIVING" | "QUARANTINED" | "INSPECTING" | "READY" | "REJECTED" | "DELETING";
                                    revision: number;
                                    uploadedBytes: number;
                                    byteLength: number | null;
                                    sha256: string | null;
                                    width: number | null;
                                    height: number | null;
                                    durationSeconds: number | null;
                                    hasThumbnail: boolean;
                                    /** @enum {string|null} */
                                    rejection: "UPLOAD_INTERRUPTED" | "UPLOAD_LENGTH_MISMATCH" | "UNSUPPORTED_FORMAT" | "INVALID_MEDIA" | "IMAGE_TOO_LARGE" | "VIDEO_LIMITS" | "UNSUPPORTED_CODEC" | "INSPECTION_TIMEOUT" | "INSPECTION_UNAVAILABLE" | "INTEGRITY_MISMATCH" | "UPLOAD_EXPIRED" | null;
                                    /** Format: date-time */
                                    createdAt: string;
                                    /** Format: date-time */
                                    updatedAt: string;
                                } | null;
                                complete: {
                                    en: boolean;
                                    ne: boolean;
                                };
                            }[];
                        };
                    };
                };
            };
            /** @description Revision conflict, changed slide set or archived bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Presentation slide limit reached. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require the current presentation expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    presentations_reorder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        /** @description Every current slide ID exactly once, in the desired order. */
        requestBody: {
            content: {
                "application/json": {
                    expectedRevision: number;
                    slideIds: string[];
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            name: string;
                            revision: number;
                            /** Format: date-time */
                            updatedAt: string;
                            slideCount: number;
                            botRevision: number;
                            /** Format: date-time */
                            botArchivedAt: string | null;
                            selected: boolean;
                            slides: {
                                title: {
                                    en: string;
                                    ne: string;
                                };
                                body: {
                                    en: string;
                                    ne: string;
                                };
                                /** Format: uuid */
                                mediaId: string | null;
                                /** @enum {string} */
                                target: "PRIMARY" | "SECONDARY" | "BOTH";
                                durationSeconds: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                presentationId: string;
                                revision: number;
                                position: number;
                                media: {
                                    /** Format: uuid */
                                    id: string;
                                    filename: string;
                                    /** @enum {string} */
                                    mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                    /** @enum {string} */
                                    state: "UPLOADING" | "RECEIVING" | "QUARANTINED" | "INSPECTING" | "READY" | "REJECTED" | "DELETING";
                                    revision: number;
                                    uploadedBytes: number;
                                    byteLength: number | null;
                                    sha256: string | null;
                                    width: number | null;
                                    height: number | null;
                                    durationSeconds: number | null;
                                    hasThumbnail: boolean;
                                    /** @enum {string|null} */
                                    rejection: "UPLOAD_INTERRUPTED" | "UPLOAD_LENGTH_MISMATCH" | "UNSUPPORTED_FORMAT" | "INVALID_MEDIA" | "IMAGE_TOO_LARGE" | "VIDEO_LIMITS" | "UNSUPPORTED_CODEC" | "INSPECTION_TIMEOUT" | "INSPECTION_UNAVAILABLE" | "INTEGRITY_MISMATCH" | "UPLOAD_EXPIRED" | null;
                                    /** Format: date-time */
                                    createdAt: string;
                                    /** Format: date-time */
                                    updatedAt: string;
                                } | null;
                                complete: {
                                    en: boolean;
                                    ne: boolean;
                                };
                            }[];
                        };
                    };
                };
            };
            /** @description Revision conflict, changed slide set or archived bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require the current presentation expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    slides_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            name: string;
                            revision: number;
                            /** Format: date-time */
                            updatedAt: string;
                            slideCount: number;
                            botRevision: number;
                            /** Format: date-time */
                            botArchivedAt: string | null;
                            selected: boolean;
                            slides: {
                                title: {
                                    en: string;
                                    ne: string;
                                };
                                body: {
                                    en: string;
                                    ne: string;
                                };
                                /** Format: uuid */
                                mediaId: string | null;
                                /** @enum {string} */
                                target: "PRIMARY" | "SECONDARY" | "BOTH";
                                durationSeconds: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                presentationId: string;
                                revision: number;
                                position: number;
                                media: {
                                    /** Format: uuid */
                                    id: string;
                                    filename: string;
                                    /** @enum {string} */
                                    mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                    /** @enum {string} */
                                    state: "UPLOADING" | "RECEIVING" | "QUARANTINED" | "INSPECTING" | "READY" | "REJECTED" | "DELETING";
                                    revision: number;
                                    uploadedBytes: number;
                                    byteLength: number | null;
                                    sha256: string | null;
                                    width: number | null;
                                    height: number | null;
                                    durationSeconds: number | null;
                                    hasThumbnail: boolean;
                                    /** @enum {string|null} */
                                    rejection: "UPLOAD_INTERRUPTED" | "UPLOAD_LENGTH_MISMATCH" | "UNSUPPORTED_FORMAT" | "INVALID_MEDIA" | "IMAGE_TOO_LARGE" | "VIDEO_LIMITS" | "UNSUPPORTED_CODEC" | "INSPECTION_TIMEOUT" | "INSPECTION_UNAVAILABLE" | "INTEGRITY_MISMATCH" | "UPLOAD_EXPIRED" | null;
                                    /** Format: date-time */
                                    createdAt: string;
                                    /** Format: date-time */
                                    updatedAt: string;
                                } | null;
                                complete: {
                                    en: boolean;
                                    ne: boolean;
                                };
                            }[];
                        };
                    };
                };
            };
            /** @description Revision conflict, unready media or archived bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require the slide expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    slides_save: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title: {
                        en: string;
                        ne: string;
                    };
                    body: {
                        en: string;
                        ne: string;
                    };
                    /** Format: uuid */
                    mediaId: string | null;
                    /** @enum {string} */
                    target: "PRIMARY" | "SECONDARY" | "BOTH";
                    durationSeconds: number;
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            name: string;
                            revision: number;
                            /** Format: date-time */
                            updatedAt: string;
                            slideCount: number;
                            botRevision: number;
                            /** Format: date-time */
                            botArchivedAt: string | null;
                            selected: boolean;
                            slides: {
                                title: {
                                    en: string;
                                    ne: string;
                                };
                                body: {
                                    en: string;
                                    ne: string;
                                };
                                /** Format: uuid */
                                mediaId: string | null;
                                /** @enum {string} */
                                target: "PRIMARY" | "SECONDARY" | "BOTH";
                                durationSeconds: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                presentationId: string;
                                revision: number;
                                position: number;
                                media: {
                                    /** Format: uuid */
                                    id: string;
                                    filename: string;
                                    /** @enum {string} */
                                    mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                    /** @enum {string} */
                                    state: "UPLOADING" | "RECEIVING" | "QUARANTINED" | "INSPECTING" | "READY" | "REJECTED" | "DELETING";
                                    revision: number;
                                    uploadedBytes: number;
                                    byteLength: number | null;
                                    sha256: string | null;
                                    width: number | null;
                                    height: number | null;
                                    durationSeconds: number | null;
                                    hasThumbnail: boolean;
                                    /** @enum {string|null} */
                                    rejection: "UPLOAD_INTERRUPTED" | "UPLOAD_LENGTH_MISMATCH" | "UNSUPPORTED_FORMAT" | "INVALID_MEDIA" | "IMAGE_TOO_LARGE" | "VIDEO_LIMITS" | "UNSUPPORTED_CODEC" | "INSPECTION_TIMEOUT" | "INSPECTION_UNAVAILABLE" | "INTEGRITY_MISMATCH" | "UPLOAD_EXPIRED" | null;
                                    /** Format: date-time */
                                    createdAt: string;
                                    /** Format: date-time */
                                    updatedAt: string;
                                } | null;
                                complete: {
                                    en: boolean;
                                    ne: boolean;
                                };
                            }[];
                        };
                    };
                };
            };
            /** @description Revision conflict, unready media or archived bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Mutations require the slide expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    botpresentation_select: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                botId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    presentationId: string | null;
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            presentationId: string | null;
                            botRevision: number;
                        };
                    };
                };
            };
            /** @description Bot revision conflict or archived bot. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Selection requires the bot expectedRevision. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    botreleases_list: {
        parameters: {
            query?: {
                pageSize?: number;
                page?: number;
                kind?: "ALL" | "PREVIEW" | "PUBLISHED";
            };
            header?: never;
            path: {
                botId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            items: ({
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                botId: string;
                                botRevision: number;
                                /** @enum {string} */
                                providerMode: "fixture" | "live";
                                snapshotHash: string;
                                /** Format: date-time */
                                createdAt: string;
                                /** @enum {string} */
                                kind: "PUBLISHED";
                                version: number;
                                /** @enum {string|null} */
                                previewExpiresAt: null;
                            } | {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                botId: string;
                                botRevision: number;
                                /** @enum {string} */
                                providerMode: "fixture" | "live";
                                snapshotHash: string;
                                /** Format: date-time */
                                createdAt: string;
                                /** @enum {string} */
                                kind: "PREVIEW";
                                /** @enum {string|null} */
                                version: null;
                                /** Format: date-time */
                                previewExpiresAt: string;
                            })[];
                            total: number;
                            page: number;
                            pageSize: number;
                        };
                    };
                };
            };
            /** @description Stale root revision, archived bot or idempotency key reused with another request. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Release is not ready. Field errors identify the selected content to correct. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Capture requires expectedRevision and Idempotency-Key. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    botreleases_publish: {
        parameters: {
            query?: never;
            header: {
                /** @description Reuse for the same request after an uncertain response. Scoped by staff membership and operation for 24 hours. */
                "Idempotency-Key": string;
            };
            path: {
                botId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expectedRevision: number;
                };
            };
        };
        responses: {
            /** @description Immutable published version, or the original version on an idempotent replay. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            botRevision: number;
                            /** @enum {string} */
                            providerMode: "fixture" | "live";
                            snapshotHash: string;
                            /** Format: date-time */
                            createdAt: string;
                            /** @enum {string} */
                            kind: "PUBLISHED";
                            version: number;
                            /** @enum {string|null} */
                            previewExpiresAt: null;
                            snapshot: {
                                /** @enum {number} */
                                schemaVersion: 1;
                                /** @enum {string} */
                                providerMode: "fixture" | "live";
                                bot: {
                                    /** Format: uuid */
                                    id: string;
                                    name: string;
                                    description: string;
                                    revision: number;
                                    config: {
                                        persona: string;
                                        greeting: {
                                            en: string;
                                            ne: string;
                                        };
                                        fallback: {
                                            en: string;
                                            ne: string;
                                        };
                                        /** @enum {string} */
                                        voiceEn: "en-US-JennyNeural";
                                        /** @enum {string} */
                                        voiceNe: "ne-NP-HemkalaNeural" | "ne-NP-SagarNeural";
                                        tools: ("lookup_knowledge" | "get_event_schedule" | "select_reference" | "show_slide")[];
                                    };
                                };
                                knowledge: {
                                    /** Format: uuid */
                                    id: string;
                                    revision: number;
                                    /** @enum {string} */
                                    type: "FAQ" | "NOTE";
                                    title: string;
                                    content: {
                                        en: string;
                                        ne: string;
                                    };
                                    question: {
                                        en: string;
                                        ne: string;
                                    };
                                    /** @enum {string} */
                                    status: "DRAFT" | "APPROVED";
                                }[];
                                presentation: {
                                    /** Format: uuid */
                                    id: string;
                                    name: string;
                                    revision: number;
                                    slides: {
                                        title: {
                                            en: string;
                                            ne: string;
                                        };
                                        body: {
                                            en: string;
                                            ne: string;
                                        };
                                        /** Format: uuid */
                                        mediaId: string | null;
                                        /** @enum {string} */
                                        target: "PRIMARY" | "SECONDARY" | "BOTH";
                                        durationSeconds: number;
                                        /** Format: uuid */
                                        id: string;
                                        revision: number;
                                        position: number;
                                    }[];
                                } | null;
                                media: {
                                    /** Format: uuid */
                                    id: string;
                                    filename: string;
                                    /** @enum {string} */
                                    mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                    sha256: string;
                                    byteLength: number;
                                    width: number;
                                    height: number;
                                    durationSeconds: number | null;
                                }[];
                            };
                        } | {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            botRevision: number;
                            /** @enum {string} */
                            providerMode: "fixture" | "live";
                            snapshotHash: string;
                            /** Format: date-time */
                            createdAt: string;
                            /** @enum {string} */
                            kind: "PREVIEW";
                            /** @enum {string|null} */
                            version: null;
                            /** Format: date-time */
                            previewExpiresAt: string;
                            snapshot: {
                                /** @enum {number} */
                                schemaVersion: 1;
                                /** @enum {string} */
                                providerMode: "fixture" | "live";
                                bot: {
                                    /** Format: uuid */
                                    id: string;
                                    name: string;
                                    description: string;
                                    revision: number;
                                    config: {
                                        persona: string;
                                        greeting: {
                                            en: string;
                                            ne: string;
                                        };
                                        fallback: {
                                            en: string;
                                            ne: string;
                                        };
                                        /** @enum {string} */
                                        voiceEn: "en-US-JennyNeural";
                                        /** @enum {string} */
                                        voiceNe: "ne-NP-HemkalaNeural" | "ne-NP-SagarNeural";
                                        tools: ("lookup_knowledge" | "get_event_schedule" | "select_reference" | "show_slide")[];
                                    };
                                };
                                knowledge: {
                                    /** Format: uuid */
                                    id: string;
                                    revision: number;
                                    /** @enum {string} */
                                    type: "FAQ" | "NOTE";
                                    title: string;
                                    content: {
                                        en: string;
                                        ne: string;
                                    };
                                    question: {
                                        en: string;
                                        ne: string;
                                    };
                                    /** @enum {string} */
                                    status: "DRAFT" | "APPROVED";
                                }[];
                                presentation: {
                                    /** Format: uuid */
                                    id: string;
                                    name: string;
                                    revision: number;
                                    slides: {
                                        title: {
                                            en: string;
                                            ne: string;
                                        };
                                        body: {
                                            en: string;
                                            ne: string;
                                        };
                                        /** Format: uuid */
                                        mediaId: string | null;
                                        /** @enum {string} */
                                        target: "PRIMARY" | "SECONDARY" | "BOTH";
                                        durationSeconds: number;
                                        /** Format: uuid */
                                        id: string;
                                        revision: number;
                                        position: number;
                                    }[];
                                } | null;
                                media: {
                                    /** Format: uuid */
                                    id: string;
                                    filename: string;
                                    /** @enum {string} */
                                    mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                    sha256: string;
                                    byteLength: number;
                                    width: number;
                                    height: number;
                                    durationSeconds: number | null;
                                }[];
                            };
                        };
                    };
                };
            };
            /** @description Stale root revision, archived bot or idempotency key reused with another request. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Release is not ready. Field errors identify the selected content to correct. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Capture requires expectedRevision and Idempotency-Key. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    botreleases_validate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                botId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expectedRevision: number;
                };
            };
        };
        responses: {
            /** @description Check the saved root draft revision without creating a release or calling a provider. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            botId: string;
                            botRevision: number;
                            /** @enum {string} */
                            providerMode: "fixture" | "live";
                            canPreview: boolean;
                            canPublish: boolean;
                            issues: {
                                /** @enum {string} */
                                code: "MISSING_TRANSLATION" | "UNAPPROVED_KNOWLEDGE" | "INVALID_CONFIG" | "MEDIA_NOT_READY" | "EMPTY_PRESENTATION" | "TOOL_REQUIRES_PRESENTATION" | "RELEASE_LIMIT";
                                path: string;
                                message: string;
                                /** @enum {string} */
                                blocks: "ALL" | "PUBLISH";
                            }[];
                        };
                    };
                };
            };
            /** @description Stale root revision, archived bot or idempotency key reused with another request. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Release is not ready. Field errors identify the selected content to correct. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Capture requires expectedRevision and Idempotency-Key. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    botreleases_preview: {
        parameters: {
            query?: never;
            header: {
                /** @description Reuse for the same request after an uncertain response. Scoped by staff membership and operation for 24 hours. */
                "Idempotency-Key": string;
            };
            path: {
                botId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expectedRevision: number;
                };
            };
        };
        responses: {
            /** @description Persist a staff-only snapshot with a 30-minute preview admission deadline. Selected draft knowledge is permitted. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            botRevision: number;
                            /** @enum {string} */
                            providerMode: "fixture" | "live";
                            snapshotHash: string;
                            /** Format: date-time */
                            createdAt: string;
                            /** @enum {string} */
                            kind: "PUBLISHED";
                            version: number;
                            /** @enum {string|null} */
                            previewExpiresAt: null;
                            snapshot: {
                                /** @enum {number} */
                                schemaVersion: 1;
                                /** @enum {string} */
                                providerMode: "fixture" | "live";
                                bot: {
                                    /** Format: uuid */
                                    id: string;
                                    name: string;
                                    description: string;
                                    revision: number;
                                    config: {
                                        persona: string;
                                        greeting: {
                                            en: string;
                                            ne: string;
                                        };
                                        fallback: {
                                            en: string;
                                            ne: string;
                                        };
                                        /** @enum {string} */
                                        voiceEn: "en-US-JennyNeural";
                                        /** @enum {string} */
                                        voiceNe: "ne-NP-HemkalaNeural" | "ne-NP-SagarNeural";
                                        tools: ("lookup_knowledge" | "get_event_schedule" | "select_reference" | "show_slide")[];
                                    };
                                };
                                knowledge: {
                                    /** Format: uuid */
                                    id: string;
                                    revision: number;
                                    /** @enum {string} */
                                    type: "FAQ" | "NOTE";
                                    title: string;
                                    content: {
                                        en: string;
                                        ne: string;
                                    };
                                    question: {
                                        en: string;
                                        ne: string;
                                    };
                                    /** @enum {string} */
                                    status: "DRAFT" | "APPROVED";
                                }[];
                                presentation: {
                                    /** Format: uuid */
                                    id: string;
                                    name: string;
                                    revision: number;
                                    slides: {
                                        title: {
                                            en: string;
                                            ne: string;
                                        };
                                        body: {
                                            en: string;
                                            ne: string;
                                        };
                                        /** Format: uuid */
                                        mediaId: string | null;
                                        /** @enum {string} */
                                        target: "PRIMARY" | "SECONDARY" | "BOTH";
                                        durationSeconds: number;
                                        /** Format: uuid */
                                        id: string;
                                        revision: number;
                                        position: number;
                                    }[];
                                } | null;
                                media: {
                                    /** Format: uuid */
                                    id: string;
                                    filename: string;
                                    /** @enum {string} */
                                    mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                    sha256: string;
                                    byteLength: number;
                                    width: number;
                                    height: number;
                                    durationSeconds: number | null;
                                }[];
                            };
                        } | {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            botRevision: number;
                            /** @enum {string} */
                            providerMode: "fixture" | "live";
                            snapshotHash: string;
                            /** Format: date-time */
                            createdAt: string;
                            /** @enum {string} */
                            kind: "PREVIEW";
                            /** @enum {string|null} */
                            version: null;
                            /** Format: date-time */
                            previewExpiresAt: string;
                            snapshot: {
                                /** @enum {number} */
                                schemaVersion: 1;
                                /** @enum {string} */
                                providerMode: "fixture" | "live";
                                bot: {
                                    /** Format: uuid */
                                    id: string;
                                    name: string;
                                    description: string;
                                    revision: number;
                                    config: {
                                        persona: string;
                                        greeting: {
                                            en: string;
                                            ne: string;
                                        };
                                        fallback: {
                                            en: string;
                                            ne: string;
                                        };
                                        /** @enum {string} */
                                        voiceEn: "en-US-JennyNeural";
                                        /** @enum {string} */
                                        voiceNe: "ne-NP-HemkalaNeural" | "ne-NP-SagarNeural";
                                        tools: ("lookup_knowledge" | "get_event_schedule" | "select_reference" | "show_slide")[];
                                    };
                                };
                                knowledge: {
                                    /** Format: uuid */
                                    id: string;
                                    revision: number;
                                    /** @enum {string} */
                                    type: "FAQ" | "NOTE";
                                    title: string;
                                    content: {
                                        en: string;
                                        ne: string;
                                    };
                                    question: {
                                        en: string;
                                        ne: string;
                                    };
                                    /** @enum {string} */
                                    status: "DRAFT" | "APPROVED";
                                }[];
                                presentation: {
                                    /** Format: uuid */
                                    id: string;
                                    name: string;
                                    revision: number;
                                    slides: {
                                        title: {
                                            en: string;
                                            ne: string;
                                        };
                                        body: {
                                            en: string;
                                            ne: string;
                                        };
                                        /** Format: uuid */
                                        mediaId: string | null;
                                        /** @enum {string} */
                                        target: "PRIMARY" | "SECONDARY" | "BOTH";
                                        durationSeconds: number;
                                        /** Format: uuid */
                                        id: string;
                                        revision: number;
                                        position: number;
                                    }[];
                                } | null;
                                media: {
                                    /** Format: uuid */
                                    id: string;
                                    filename: string;
                                    /** @enum {string} */
                                    mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                    sha256: string;
                                    byteLength: number;
                                    width: number;
                                    height: number;
                                    durationSeconds: number | null;
                                }[];
                            };
                        };
                    };
                };
            };
            /** @description Stale root revision, archived bot or idempotency key reused with another request. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Release is not ready. Field errors identify the selected content to correct. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Capture requires expectedRevision and Idempotency-Key. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    releases_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Inspect a saved snapshot, including an expired preview. This does not admit a conversation. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            botRevision: number;
                            /** @enum {string} */
                            providerMode: "fixture" | "live";
                            snapshotHash: string;
                            /** Format: date-time */
                            createdAt: string;
                            /** @enum {string} */
                            kind: "PUBLISHED";
                            version: number;
                            /** @enum {string|null} */
                            previewExpiresAt: null;
                            snapshot: {
                                /** @enum {number} */
                                schemaVersion: 1;
                                /** @enum {string} */
                                providerMode: "fixture" | "live";
                                bot: {
                                    /** Format: uuid */
                                    id: string;
                                    name: string;
                                    description: string;
                                    revision: number;
                                    config: {
                                        persona: string;
                                        greeting: {
                                            en: string;
                                            ne: string;
                                        };
                                        fallback: {
                                            en: string;
                                            ne: string;
                                        };
                                        /** @enum {string} */
                                        voiceEn: "en-US-JennyNeural";
                                        /** @enum {string} */
                                        voiceNe: "ne-NP-HemkalaNeural" | "ne-NP-SagarNeural";
                                        tools: ("lookup_knowledge" | "get_event_schedule" | "select_reference" | "show_slide")[];
                                    };
                                };
                                knowledge: {
                                    /** Format: uuid */
                                    id: string;
                                    revision: number;
                                    /** @enum {string} */
                                    type: "FAQ" | "NOTE";
                                    title: string;
                                    content: {
                                        en: string;
                                        ne: string;
                                    };
                                    question: {
                                        en: string;
                                        ne: string;
                                    };
                                    /** @enum {string} */
                                    status: "DRAFT" | "APPROVED";
                                }[];
                                presentation: {
                                    /** Format: uuid */
                                    id: string;
                                    name: string;
                                    revision: number;
                                    slides: {
                                        title: {
                                            en: string;
                                            ne: string;
                                        };
                                        body: {
                                            en: string;
                                            ne: string;
                                        };
                                        /** Format: uuid */
                                        mediaId: string | null;
                                        /** @enum {string} */
                                        target: "PRIMARY" | "SECONDARY" | "BOTH";
                                        durationSeconds: number;
                                        /** Format: uuid */
                                        id: string;
                                        revision: number;
                                        position: number;
                                    }[];
                                } | null;
                                media: {
                                    /** Format: uuid */
                                    id: string;
                                    filename: string;
                                    /** @enum {string} */
                                    mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                    sha256: string;
                                    byteLength: number;
                                    width: number;
                                    height: number;
                                    durationSeconds: number | null;
                                }[];
                            };
                        } | {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            botId: string;
                            botRevision: number;
                            /** @enum {string} */
                            providerMode: "fixture" | "live";
                            snapshotHash: string;
                            /** Format: date-time */
                            createdAt: string;
                            /** @enum {string} */
                            kind: "PREVIEW";
                            /** @enum {string|null} */
                            version: null;
                            /** Format: date-time */
                            previewExpiresAt: string;
                            snapshot: {
                                /** @enum {number} */
                                schemaVersion: 1;
                                /** @enum {string} */
                                providerMode: "fixture" | "live";
                                bot: {
                                    /** Format: uuid */
                                    id: string;
                                    name: string;
                                    description: string;
                                    revision: number;
                                    config: {
                                        persona: string;
                                        greeting: {
                                            en: string;
                                            ne: string;
                                        };
                                        fallback: {
                                            en: string;
                                            ne: string;
                                        };
                                        /** @enum {string} */
                                        voiceEn: "en-US-JennyNeural";
                                        /** @enum {string} */
                                        voiceNe: "ne-NP-HemkalaNeural" | "ne-NP-SagarNeural";
                                        tools: ("lookup_knowledge" | "get_event_schedule" | "select_reference" | "show_slide")[];
                                    };
                                };
                                knowledge: {
                                    /** Format: uuid */
                                    id: string;
                                    revision: number;
                                    /** @enum {string} */
                                    type: "FAQ" | "NOTE";
                                    title: string;
                                    content: {
                                        en: string;
                                        ne: string;
                                    };
                                    question: {
                                        en: string;
                                        ne: string;
                                    };
                                    /** @enum {string} */
                                    status: "DRAFT" | "APPROVED";
                                }[];
                                presentation: {
                                    /** Format: uuid */
                                    id: string;
                                    name: string;
                                    revision: number;
                                    slides: {
                                        title: {
                                            en: string;
                                            ne: string;
                                        };
                                        body: {
                                            en: string;
                                            ne: string;
                                        };
                                        /** Format: uuid */
                                        mediaId: string | null;
                                        /** @enum {string} */
                                        target: "PRIMARY" | "SECONDARY" | "BOTH";
                                        durationSeconds: number;
                                        /** Format: uuid */
                                        id: string;
                                        revision: number;
                                        position: number;
                                    }[];
                                } | null;
                                media: {
                                    /** Format: uuid */
                                    id: string;
                                    filename: string;
                                    /** @enum {string} */
                                    mimeType: "image/jpeg" | "image/png" | "video/mp4";
                                    sha256: string;
                                    byteLength: number;
                                    width: number;
                                    height: number;
                                    durationSeconds: number | null;
                                }[];
                            };
                        };
                    };
                };
            };
        };
    };
    releases_search: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        /** @description English/Nepali query (1–500 characters, no NUL). Body transport keeps query text out of URLs. */
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    locale: "en" | "ne";
                    query: string;
                };
            };
        };
        responses: {
            /** @description At most five passages and 6000 combined Unicode code points from this pinned release. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            releaseId: string;
                            snapshotHash: string;
                            /** @enum {string} */
                            locale: "en" | "ne";
                            passages: {
                                /** Format: uuid */
                                entryId: string;
                                title: string;
                                question: string;
                                text: string;
                                score: number;
                                truncated: boolean;
                            }[];
                        };
                    };
                };
            };
            /** @description The preview has expired for new query inspection. Historical snapshot reads remain available. */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    events_list: {
        parameters: {
            query?: {
                archived?: "true" | "false";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            items: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                                venue: string;
                                timezone: string;
                                /** Format: date-time */
                                suggestedStartsAt: string | null;
                                /** Format: date-time */
                                suggestedEndsAt: string | null;
                                /** Format: date-time */
                                archivedAt: string | null;
                                revision: number;
                                deploymentCount: number;
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                updatedAt: string;
                            }[];
                        };
                    };
                };
            };
        };
    };
    events_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @default  */
                    venue?: string;
                    timezone: string;
                    /**
                     * Format: date-time
                     * @default null
                     */
                    suggestedStartsAt?: string | null;
                    /**
                     * Format: date-time
                     * @default null
                     */
                    suggestedEndsAt?: string | null;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            venue: string;
                            timezone: string;
                            /** Format: date-time */
                            suggestedStartsAt: string | null;
                            /** Format: date-time */
                            suggestedEndsAt: string | null;
                            /** Format: date-time */
                            archivedAt: string | null;
                            revision: number;
                            deploymentCount: number;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        };
                    };
                };
            };
        };
    };
    events_save: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @default  */
                    venue?: string;
                    timezone: string;
                    /**
                     * Format: date-time
                     * @default null
                     */
                    suggestedStartsAt?: string | null;
                    /**
                     * Format: date-time
                     * @default null
                     */
                    suggestedEndsAt?: string | null;
                    expectedRevision: number;
                };
            };
        };
        responses: {
            /** @description Edits never move deployments; they own their times. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            venue: string;
                            timezone: string;
                            /** Format: date-time */
                            suggestedStartsAt: string | null;
                            /** Format: date-time */
                            suggestedEndsAt: string | null;
                            /** Format: date-time */
                            archivedAt: string | null;
                            revision: number;
                            deploymentCount: number;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        };
                    };
                };
            };
            /** @description Stale revision (the error includes currentRevision) or a closed deployment. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description expectedRevision is required. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    events_archive: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    archived: boolean;
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            venue: string;
                            timezone: string;
                            /** Format: date-time */
                            suggestedStartsAt: string | null;
                            /** Format: date-time */
                            suggestedEndsAt: string | null;
                            /** Format: date-time */
                            archivedAt: string | null;
                            revision: number;
                            deploymentCount: number;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        };
                    };
                };
            };
            /** @description Stale revision (the error includes currentRevision) or a closed deployment. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description expectedRevision is required. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    deployments_board: {
        parameters: {
            query: {
                to: string;
                from: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Devices with desired and applied state, and deployments overlapping [from, to). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            devices: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                                enabled: boolean;
                                desired: {
                                    revision: number;
                                    /** Format: uuid */
                                    releaseId: string | null;
                                    /** Format: uuid */
                                    deploymentId: string | null;
                                    appliedRevision: number;
                                    /** Format: uuid */
                                    appliedReleaseId: string | null;
                                    /** Format: date-time */
                                    appliedAt: string | null;
                                };
                            }[];
                            deployments: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                deviceId: string;
                                /** @enum {string} */
                                kind: "SCHEDULED" | "OVERRIDE";
                                release: {
                                    /** Format: uuid */
                                    id: string;
                                    /** Format: uuid */
                                    botId: string;
                                    botName: string;
                                    version: number;
                                };
                                event: {
                                    /** Format: uuid */
                                    id: string;
                                    name: string;
                                } | null;
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                /** Format: date-time */
                                cancelledAt: string | null;
                                /** @enum {string} */
                                state: "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELLED";
                                revision: number;
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                updatedAt: string;
                            }[];
                        };
                    };
                };
            };
        };
    };
    deployments_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    deviceId: string;
                    /** Format: uuid */
                    releaseId: string;
                    /**
                     * Format: uuid
                     * @default null
                     */
                    eventId?: string | null;
                    /** Format: date-time */
                    startsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                };
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            deviceId: string;
                            /** @enum {string} */
                            kind: "SCHEDULED" | "OVERRIDE";
                            release: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                botId: string;
                                botName: string;
                                version: number;
                            };
                            event: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                            } | null;
                            /** Format: date-time */
                            startsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                            /** Format: date-time */
                            cancelledAt: string | null;
                            /** @enum {string} */
                            state: "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELLED";
                            revision: number;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        };
                    };
                };
            };
            /** @description SCHEDULE_CONFLICT or OVERRIDE_CONFLICT. conflictIds lists only this organisation’s blocking deployments. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Preview release, or a window that has ended or exceeds 31 days. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    deployments_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            deviceId: string;
                            /** @enum {string} */
                            kind: "SCHEDULED" | "OVERRIDE";
                            release: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                botId: string;
                                botName: string;
                                version: number;
                            };
                            event: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                            } | null;
                            /** Format: date-time */
                            startsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                            /** Format: date-time */
                            cancelledAt: string | null;
                            /** @enum {string} */
                            state: "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELLED";
                            revision: number;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        };
                    };
                };
            };
        };
    };
    deployments_save: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    releaseId: string;
                    /** Format: uuid */
                    eventId: string | null;
                    /** Format: date-time */
                    startsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            deviceId: string;
                            /** @enum {string} */
                            kind: "SCHEDULED" | "OVERRIDE";
                            release: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                botId: string;
                                botName: string;
                                version: number;
                            };
                            event: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                            } | null;
                            /** Format: date-time */
                            startsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                            /** Format: date-time */
                            cancelledAt: string | null;
                            /** @enum {string} */
                            state: "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELLED";
                            revision: number;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        };
                    };
                };
            };
            /** @description SCHEDULE_CONFLICT or OVERRIDE_CONFLICT. conflictIds lists only this organisation’s blocking deployments. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description expectedRevision is required. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    deployments_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expectedRevision: number;
                };
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            deviceId: string;
                            /** @enum {string} */
                            kind: "SCHEDULED" | "OVERRIDE";
                            release: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                botId: string;
                                botName: string;
                                version: number;
                            };
                            event: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                            } | null;
                            /** Format: date-time */
                            startsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                            /** Format: date-time */
                            cancelledAt: string | null;
                            /** @enum {string} */
                            state: "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELLED";
                            revision: number;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        };
                    };
                };
            };
            /** @description Stale revision (the error includes currentRevision) or a closed deployment. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description expectedRevision is required. */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    deviceschedule_override: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    releaseId: string;
                    /** @default 30 */
                    minutes?: number;
                    /**
                     * Format: uuid
                     * @default null
                     */
                    replaceOverrideId?: string | null;
                };
            };
        };
        responses: {
            /** @description Starts now and wins over any schedule until it ends or is cancelled. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            deviceId: string;
                            /** @enum {string} */
                            kind: "SCHEDULED" | "OVERRIDE";
                            release: {
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                botId: string;
                                botName: string;
                                version: number;
                            };
                            event: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                            } | null;
                            /** Format: date-time */
                            startsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                            /** Format: date-time */
                            cancelledAt: string | null;
                            /** @enum {string} */
                            state: "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELLED";
                            revision: number;
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                        };
                    };
                };
            };
            /** @description SCHEDULE_CONFLICT or OVERRIDE_CONFLICT. conflictIds lists only this organisation’s blocking deployments. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    deviceschedule_timeline: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Desired and acknowledged revisions with the latest commands. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uuid */
                            deviceId: string;
                            desired: {
                                revision: number;
                                /** Format: uuid */
                                releaseId: string | null;
                                /** Format: uuid */
                                deploymentId: string | null;
                                appliedRevision: number;
                                /** Format: uuid */
                                appliedReleaseId: string | null;
                                /** Format: date-time */
                                appliedAt: string | null;
                            };
                            commands: {
                                /** Format: uuid */
                                id: string;
                                type: string;
                                stateRevision: number;
                                /** Format: uuid */
                                releaseId: string | null;
                                /** @enum {string} */
                                status: "QUEUED" | "SENT" | "ACKNOWLEDGED" | "FAILED" | "EXPIRED" | "SUPERSEDED";
                                attempts: number;
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                sentAt: string | null;
                                /** Format: date-time */
                                acknowledgedAt: string | null;
                                /** @enum {string|null} */
                                result: "APPLIED" | "REJECTED" | null;
                                reason: string | null;
                            }[];
                        };
                    };
                };
            };
        };
    };
}
