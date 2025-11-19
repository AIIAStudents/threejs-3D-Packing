# logger.py
import os, time, json
LOG_VERBOSE = os.getenv("LOG_VERBOSE","true").lower()=='true'
def log(level, mod, trace, event, **fields):
    head = f"[{level}][{mod}][{trace}] {event}"
    # 使用 ensure_ascii=False 來正確處理中文字元
    body = ", ".join([f"{k}={json.dumps(v, ensure_ascii=False)}" for k,v in fields.items()])
    print(f"{head} {body}" if body else head, flush=True)
