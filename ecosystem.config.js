module.exports = {
    apps: [
        {
            name: 'web',
            script: 'bin/www',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            log_date_format: 'YYYY-MM-DD HH:mm Z',
        },
    ],
};
