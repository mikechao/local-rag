export const createRequire = () => {
    return () => {
        throw new Error("require is not supported in the browser");
    };
};
