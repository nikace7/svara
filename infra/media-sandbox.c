#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/landlock.h>
#include <sched.h>
#include <seccomp.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

/* Fail closed: no fallback to an unrestricted native parser. No namespace or
 * Docker socket privileges are needed. Exit 78 means unavailable isolation. */
static void unavailable(void) { _exit(78); }

static void limit(int resource, rlim_t value) {
    struct rlimit bound = { value, value };
    if (setrlimit(resource, &bound)) unavailable();
}

static void allow_fd(int rules, int fd, uint64_t access) {
    struct landlock_path_beneath_attr rule = { .allowed_access = access, .parent_fd = fd };
    if (syscall(SYS_landlock_add_rule, rules, LANDLOCK_RULE_PATH_BENEATH, &rule, 0)) unavailable();
}

static void allow_path(int rules, const char *path, uint64_t access) {
    int fd = open(path, O_PATH | O_CLOEXEC);
    if (fd < 0) {
        if (errno == ENOENT) return; /* Optional architecture-specific library directory. */
        unavailable();
    }
    allow_fd(rules, fd, access);
    close(fd);
}

static void sandbox(const char *input) {
    int abi = (int)syscall(SYS_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
    if (abi < 3) unavailable(); /* Includes truncate protection. */
    struct landlock_ruleset_attr policy = { .handled_access_fs = (1ULL << 15) - 1 };
    if (abi >= 5) policy.handled_access_fs |= 1ULL << 15; /* Device ioctl. */
    int rules = (int)syscall(SYS_landlock_create_ruleset, &policy, sizeof(policy), 0);
    if (rules < 0) unavailable();
    int source = open(input, O_PATH | O_NOFOLLOW | O_CLOEXEC);
    struct stat status;
    if (source < 0 || fstat(source, &status) || !S_ISREG(status.st_mode) || status.st_nlink != 1 ||
        status.st_size < 1 || status.st_size > 50 * 1024 * 1024) unavailable();
    allow_fd(rules, source, LANDLOCK_ACCESS_FS_READ_FILE);
    close(source);
    const uint64_t read = LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR;
    allow_path(rules, "/usr/lib", read);
    allow_path(rules, "/lib", read);
    allow_path(rules, "/lib64", read);
    allow_path(rules, "/etc/ld.so.cache", LANDLOCK_ACCESS_FS_READ_FILE);
    /* The kernel also checks EXECUTE on an ELF program's dynamic interpreter. */
    allow_path(rules, "/lib64/ld-linux-x86-64.so.2", LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_EXECUTE);
    allow_path(rules, "/lib/ld-linux-aarch64.so.1", LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_EXECUTE);
    allow_path(rules, "/usr/bin/ffprobe", LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_EXECUTE);
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) ||
        syscall(SYS_landlock_restrict_self, rules, 0)) unavailable();
    close(rules);

    scmp_filter_ctx filter = seccomp_init(SCMP_ACT_ALLOW);
    if (!filter) unavailable();
    const char *denied[] = {
        "socket", "socketpair", "connect", "bind", "listen", "accept", "accept4",
        "sendto", "sendmsg", "sendmmsg", "recvfrom", "recvmsg", "recvmmsg",
        "fork", "vfork", "ptrace", "process_vm_readv", "process_vm_writev",
        "pidfd_open", "pidfd_getfd", "pidfd_send_signal", "kill", "tkill", "tgkill",
        "io_uring_setup", "io_uring_enter", "io_uring_register", "mount", "unshare",
        "setns", "bpf", "perf_event_open", "keyctl", "open_by_handle_at", "userfaultfd"
    };
    for (size_t i = 0; i < sizeof(denied) / sizeof(denied[0]); i++) {
        int number = seccomp_syscall_resolve_name(denied[i]);
        if (number != __NR_SCMP_ERROR && seccomp_rule_add(filter, SCMP_ACT_ERRNO(EACCES), number, 0)) unavailable();
    }
    /* Permit libc threads, not new processes. ENOSYS makes libc use clone's
     * inspectable flags when clone3 is unavailable under this policy. */
    if (seccomp_rule_add(filter, SCMP_ACT_ERRNO(ENOSYS), SCMP_SYS(clone3), 0) ||
        seccomp_rule_add(filter, SCMP_ACT_ERRNO(EACCES), SCMP_SYS(clone), 1,
                         SCMP_A0(SCMP_CMP_MASKED_EQ, CLONE_THREAD, 0)) ||
        seccomp_load(filter)) unavailable();
    seccomp_release(filter);
    if (close_range(3, ~0U, 0)) unavailable();
    limit(RLIMIT_CORE, 0);
    limit(RLIMIT_CPU, 10);
    limit(RLIMIT_AS, 512 * 1024 * 1024);
    limit(RLIMIT_FSIZE, 0);
    limit(RLIMIT_NOFILE, 64);
}

static int denied_open(const char *path, int flags) {
    int fd = open(path, flags, 0600);
    if (fd >= 0) { close(fd); return 0; }
    return errno == EACCES || errno == EPERM;
}

int main(int argc, char **argv) {
    int check = argc == 4 && !strcmp(argv[1], "--self-test");
    if ((!check && argc != 2) || argv[check ? 2 : 1][0] != '/') unavailable();
    const char *input = argv[check ? 2 : 1];
    sandbox(input);
    if (check) {
        int fd = open(input, O_RDONLY);
        if (fd < 0) return 1;
        close(fd);
        if (!denied_open(argv[3], O_RDONLY) || !denied_open(input, O_WRONLY) ||
            !denied_open("/proc/self/environ", O_RDONLY)) return 1;
        if (socket(AF_INET, SOCK_STREAM, 0) != -1 || errno != EACCES) return 1;
        if (socket(AF_UNIX, SOCK_STREAM, 0) != -1 || errno != EACCES) return 1;
        if (fork() != -1 || errno != EACCES) return 1;
        puts("{\"ok\":true}");
        return 0;
    }
    char *const arguments[] = {
        "/usr/bin/ffprobe", "-v", "error", "-max_alloc", "67108864",
        "-protocol_whitelist", "file", "-format_whitelist", "mov", "-f", "mov",
        "-enable_drefs", "0", "-use_absolute_path", "0", "-threads", "1",
        "-analyzeduration", "5000000", "-probesize", "5242880", "-show_entries",
        "stream=codec_type,codec_name,width,height,duration,pix_fmt:stream_disposition=attached_pic:format=duration",
        "-of", "json", (char *)input, NULL
    };
    char *const environment[] = { "LANG=C", "LC_ALL=C", NULL };
    execve(arguments[0], arguments, environment);
    unavailable();
}
