export type ApiResponse<T = any> = {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
};

export class ApiError extends Error {
    constructor(
        public code: string,
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
    }
}

export function handleApiError(error: unknown): ApiResponse {
    console.error('API Error:', error);

    if (error instanceof ApiError) {
        return {
            success: false,
            error: {
                code: error.code,
                message: error.message
            }
        };
    }

    return {
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred'
        }
    };
}