// LogReporter.ts (修正后的 _checkRetryQueue 方法)

private _checkRetryQueue(): void {
    const now = Date.now();
    const logsToRetry: LogEntry[] = [];
    const newRetryQueue: RetryBatch[] = [];

    // 1. 筛选出需要重试的日志
    this.retryQueue.forEach(batch => {
        if (batch.nextRetryTime <= now) {
            logsToRetry.push(...batch.logs);
        } else {
            newRetryQueue.push(batch);
        }
    });

    this.retryQueue = newRetryQueue;

    if (logsToRetry.length === 0) {
        return;
    }

    const maxQueueSize = this.config.options.maxQueueSize;
    const currentQueueSize = this.logQueue.length;
    const availableSpace = maxQueueSize - currentQueueSize;
    
    let finalLogsToInsert: LogEntry[] = logsToRetry;

    // 2. 检查是否超出容量
    if (logsToRetry.length > availableSpace) {
        // 计算需要丢弃的数量 (丢弃 logsToRetry 中最老的)
        const logsToDropCount = logsToRetry.length - availableSpace;
        
        // 丢弃 logsToRetry 中最前面的 N 条（即最早失败的重试批次）
        finalLogsToInsert = logsToRetry.slice(logsToDropCount);
        
        console.warn(
            `LogReporter: 重试队列溢出 (${logsToRetry.length} 条 > 剩余 ${availableSpace} 条)。已丢弃最老的 ${logsToDropCount} 条重试日志。`
        );
    }
    
    // 3. 重新排队
    if (finalLogsToInsert.length > 0) {
        this.logQueue.unshift(...finalLogsToInsert);
        console.info(
            `LogReporter: 成功重新排队 ${finalLogsToInsert.length} 条日志进行重试。`
        );
    }
}