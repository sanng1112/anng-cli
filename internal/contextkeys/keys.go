package contextkeys

type ContextKey string

const (
	SessionIDKey   ContextKey = "session_id"
	ProjectRootKey ContextKey = "project_root"
)
