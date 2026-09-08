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
}
